import Foundation
import Combine

public final class PackageImporter: ObservableObject, @unchecked Sendable {
    public static let shared = PackageImporter()

    @Published public var isImporting: Bool = false
    @Published public var progress: Double = 0.0
    @Published public var statusMessage: String = ""
    @Published public var errorMessage: String? = nil

    private let db = DatabaseManager.shared

    public init() {}

    public func importPackage(from sourceURL: URL, completion: (@Sendable (Bool) -> Void)? = nil) {
        let isSecurityScoped = sourceURL.startAccessingSecurityScopedResource()

        DispatchQueue.main.async {
            self.isImporting = true
            self.progress = 0.05
            self.statusMessage = "正在解包资料..."
            self.errorMessage = nil
        }

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }
            defer {
                if isSecurityScoped {
                    sourceURL.stopAccessingSecurityScopedResource()
                }
            }

            let fileManager = FileManager.default
            let tempDir = fileManager.temporaryDirectory.appendingPathComponent("literae_import_\(UUID().uuidString)", isDirectory: true)

            do {
                try fileManager.createDirectory(at: tempDir, withIntermediateDirectories: true)
                defer { try? fileManager.removeItem(at: tempDir) }

                // 使用 unzip 命令或系统解压
                let process = Process()
                process.executableURL = URL(fileURLWithPath: "/usr/bin/unzip")
                process.arguments = ["-q", "-o", sourceURL.path, "-d", tempDir.path]
                try process.run()
                process.waitUntilExit()

                guard process.terminationStatus == 0 else {
                    throw NSError(domain: "LiteraeMobile", code: 1, userInfo: [NSLocalizedDescriptionKey: "无法解压 ZIP 数据包"])
                }

                // 读取 manifest.json
                let manifestURL = tempDir.appendingPathComponent("manifest.json")
                let manifestData = try Data(contentsOf: manifestURL)
                let manifest = try JSONDecoder().decode(PackageManifest.self, from: manifestData)

                guard manifest.format == "literae-mobile" else {
                    throw NSError(domain: "LiteraeMobile", code: 2, userInfo: [NSLocalizedDescriptionKey: "不是合法的 Literae Mobile 数据包"])
                }
                guard manifest.schemaVersion == 1 else {
                    throw NSError(domain: "LiteraeMobile", code: 3, userInfo: [NSLocalizedDescriptionKey: "不支持的数据包格式版本 v\(manifest.schemaVersion)"])
                }

                DispatchQueue.main.async {
                    self.progress = 0.15
                    self.statusMessage = "正在导入文档目次..."
                }

                // 导入 documents.jsonl
                let docsURL = tempDir.appendingPathComponent("documents.jsonl")
                let docsData = try Data(contentsOf: docsURL)
                if let docsStr = String(data: docsData, encoding: .utf8) {
                    var docBatch: [Document] = []
                    let lines = docsStr.components(separatedBy: "\n")
                    for line in lines where !line.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        if let lineData = line.data(using: .utf8),
                           let doc = try? JSONDecoder().decode(Document.self, from: lineData) {
                            docBatch.append(doc)
                            if docBatch.count >= 500 {
                                self.db.insertDocumentsBatch(docBatch)
                                docBatch.removeAll(keepingCapacity: true)
                            }
                        }
                    }
                    if !docBatch.isEmpty {
                        self.db.insertDocumentsBatch(docBatch)
                    }
                }

                DispatchQueue.main.async {
                    self.progress = 0.35
                    self.statusMessage = "正在写入识别文本..."
                }

                // 导入 pages.jsonl
                let pagesURL = tempDir.appendingPathComponent("pages.jsonl")
                let pagesData = try Data(contentsOf: pagesURL)
                if let pagesStr = String(data: pagesData, encoding: .utf8) {
                    var pageBatch: [PageRecord] = []
                    let lines = pagesStr.components(separatedBy: "\n")
                    let totalLines = max(lines.count, 1)
                    var processed = 0

                    for line in lines where !line.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        if let lineData = line.data(using: .utf8),
                           let pageRecord = try? JSONDecoder().decode(PageRecord.self, from: lineData) {
                            pageBatch.append(pageRecord)
                            processed += 1
                            if pageBatch.count >= 500 {
                                self.db.insertPagesBatch(pageBatch)
                                pageBatch.removeAll(keepingCapacity: true)

                                let p = 0.35 + 0.60 * (Double(processed) / Double(totalLines))
                                DispatchQueue.main.async {
                                    self.progress = min(p, 0.95)
                                }
                            }
                        }
                    }
                    if !pageBatch.isEmpty {
                        self.db.insertPagesBatch(pageBatch)
                    }
                }

                DispatchQueue.main.async {
                    self.progress = 1.0
                    self.statusMessage = "导入完成！"
                    self.isImporting = false
                    completion?(true)
                }

            } catch {
                DispatchQueue.main.async {
                    self.isImporting = false
                    self.errorMessage = error.localizedDescription
                    completion?(false)
                }
            }
        }
    }
}
