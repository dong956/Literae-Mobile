import Foundation

public struct Document: Identifiable, Codable, Hashable {
    public let id: String
    public let title: String
    public let author: String
    public let publisher: String
    public let year: String
    public let category: String
    public let tags: [String]
    public let pageCount: Int

    enum CodingKeys: String, CodingKey {
        case id
        case title
        case author
        case publisher
        case year
        case category
        case tags
        case pageCount = "page_count"
    }

    public init(
        id: String,
        title: String,
        author: String = "",
        publisher: String = "",
        year: String = "",
        category: String = "",
        tags: [String] = [],
        pageCount: Int = 0
    ) {
        self.id = id
        self.title = title
        self.author = author
        self.publisher = publisher
        self.year = year
        self.category = category
        self.tags = tags
        self.pageCount = pageCount
    }

    public var metaDisplay: String {
        let parts = [author, year, publisher].filter { !$0.isEmpty }
        return parts.isEmpty ? "出版信息未详" : parts.joined(separator: " · ")
    }
}
