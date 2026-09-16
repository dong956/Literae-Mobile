import Foundation

public struct PackageManifest: Codable {
    public let format: String
    public let schemaVersion: Int
    public let packageId: String?
    public let createdAt: String?
    public let desktopVersion: String?
    public let documentCount: Int
    public let pageCount: Int

    enum CodingKeys: String, CodingKey {
        case format
        case schemaVersion = "schema_version"
        case packageId = "package_id"
        case createdAt = "created_at"
        case desktopVersion = "desktop_version"
        case documentCount = "document_count"
        case pageCount = "page_count"
    }
}
