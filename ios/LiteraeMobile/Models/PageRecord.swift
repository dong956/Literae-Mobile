import Foundation

public struct PageRecord: Identifiable, Codable, Hashable {
    public var id: String { "\(documentId)_\(page)" }
    public let documentId: String
    public let page: Int
    public let text: String

    enum CodingKeys: String, CodingKey {
        case documentId = "document_id"
        case page
        case text
    }

    public init(documentId: String, page: Int, text: String) {
        self.documentId = documentId
        self.page = page
        self.text = text
    }
}
