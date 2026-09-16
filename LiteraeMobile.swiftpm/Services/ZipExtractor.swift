import Foundation
import Compression

/// 纯 Swift 轻量级 ZIP 解包器
/// 零第三方库依赖，基于 Apple 系统的 Compression (libcompression) 框架
/// 专为 iOS / iPadOS 沙盒设计（不依赖 macOS 的 /usr/bin/unzip 进程）
public struct ZipExtractor {
    public static func extract(data: Data) throws -> [String: Data] {
        var results: [String: Data] = [:]
        var offset = 0
        let count = data.count

        try data.withUnsafeBytes { rawBuffer in
            guard let bytes = rawBuffer.bindMemory(to: UInt8.self).baseAddress else {
                throw NSError(domain: "LiteraeMobile", code: 10, userInfo: [NSLocalizedDescriptionKey: "无法读取数据包内存"])
            }

            while offset + 30 <= count {
                let sig = rawBuffer.loadUnaligned(fromByteOffset: offset, as: UInt32.self)
                // PK\x03\x04 (Local file header signature)
                if sig != 0x04034b50 {
                    break
                }
                let method = rawBuffer.loadUnaligned(fromByteOffset: offset + 8, as: UInt16.self)
                let compSize = Int(rawBuffer.loadUnaligned(fromByteOffset: offset + 18, as: UInt32.self))
                let uncompSize = Int(rawBuffer.loadUnaligned(fromByteOffset: offset + 22, as: UInt32.self))
                let fnLen = Int(rawBuffer.loadUnaligned(fromByteOffset: offset + 26, as: UInt16.self))
                let extraLen = Int(rawBuffer.loadUnaligned(fromByteOffset: offset + 28, as: UInt16.self))

                let fnStart = offset + 30
                guard fnStart + fnLen <= count else { break }
                let fnData = Data(bytes: bytes + fnStart, count: fnLen)
                let filename = String(data: fnData, encoding: .utf8) ?? "unknown"

                let dataStart = fnStart + fnLen + extraLen
                if dataStart + compSize > count { break }

                if method == 0 {
                    // Stored (未压缩)
                    results[filename] = Data(bytes: bytes + dataStart, count: compSize)
                } else if method == 8 {
                    // Deflate 压缩
                    let dest = UnsafeMutablePointer<UInt8>.allocate(capacity: max(uncompSize, 1))
                    defer { dest.deallocate() }
                    let decompressedBytes = compression_decode_buffer(dest, uncompSize, bytes + dataStart, compSize, nil, COMPRESSION_ZLIB)
                    if decompressedBytes == uncompSize {
                        results[filename] = Data(bytes: dest, count: uncompSize)
                    } else {
                        throw NSError(domain: "LiteraeMobile", code: 11, userInfo: [NSLocalizedDescriptionKey: "解压 \(filename) 失败"])
                    }
                }
                offset = dataStart + compSize
            }
        }
        return results
    }
}
