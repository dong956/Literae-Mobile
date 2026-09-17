import SwiftUI

public struct DocumentDetailView: View {
    public let document: Document
    @State private var pages: [Int] = []
    @State private var selectedPageForReader: Int? = nil
    @State private var searchQuery: String = ""
    @State private var searchResults: [(document: Document, page: Int, text: String)] = []

    private let db = DatabaseManager.shared

    public init(document: Document) {
        self.document = document
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                // 文献元数据卡片
                VStack(alignment: .leading, spacing: 10) {
                    Text(document.title)
                        .font(.title2)
                        .fontWeight(.bold)

                    Text(document.metaDisplay)
                        .font(.subheadline)
                        .foregroundColor(.secondary)

                    Divider()

                    metaRow(label: "责任者", value: document.author.isEmpty ? "未录入" : document.author)
                    metaRow(label: "出版年代", value: document.year.isEmpty ? "未录入" : document.year)
                    metaRow(label: "出版单位", value: document.publisher.isEmpty ? "未录入" : document.publisher)
                    metaRow(label: "学科分类", value: document.category.isEmpty ? "未分类" : document.category)

                    if !document.tags.isEmpty {
                        HStack(alignment: .top, spacing: 8) {
                            Text("主题标签")
                                .font(.caption)
                                .foregroundColor(.secondary)
                                .frame(width: 60, alignment: .leading)
                            WrappingHStack(tags: document.tags)
                        }
                    }
                }
                .padding()
                .background(Color(red: 0.96, green: 0.97, blue: 0.99))
                .cornerRadius(16)

                // 通读主按钮
                if let firstPage = pages.first {
                    NavigationLink(destination: ReaderView(document: document, initialPage: firstPage)) {
                        HStack {
                            Spacer()
                            Image(systemName: "book.fill")
                            Text("从第 \(firstPage) 页开始通读")
                                .fontWeight(.semibold)
                            Spacer()
                        }
                        .padding()
                        .background(Color(red: 0.19, green: 0.36, blue: 0.96))
                        .foregroundColor(.white)
                        .cornerRadius(14)
                    }
                }

                VStack(alignment: .leading, spacing: 10) {
                    Text("在本书内检索")
                        .font(.headline)
                    HStack {
                        Image(systemName: "magnifyingglass")
                            .foregroundColor(Color(red: 0.19, green: 0.36, blue: 0.96))
                        TextField("输入本书中的关键词", text: $searchQuery)
                            .textFieldStyle(.plain)
                            .onSubmit { performDocumentSearch() }
                        Button("检索", action: performDocumentSearch)
                            .font(.subheadline)
                            .fontWeight(.semibold)
                            .foregroundColor(Color(red: 0.19, green: 0.36, blue: 0.96))
                    }
                    .padding(11)
                    .background(Color.white)
                    .cornerRadius(12)
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.primary.opacity(0.12), lineWidth: 1))

                    if !searchQuery.isEmpty {
                        Text(searchResults.isEmpty ? "本书中没有找到匹配页面" : "本书共找到 \(searchResults.count) 个相关页面")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }

                    ForEach(searchResults, id: \.page) { result in
                        NavigationLink(destination: ReaderView(document: document, initialPage: result.page, terms: [searchQuery])) {
                            SearchResultCard(result: result, query: searchQuery)
                        }
                        .buttonStyle(.plain)
                    }
                }

                // 页面目录网格
                VStack(alignment: .leading, spacing: 12) {
                    Text("已收录 OCR 页码 (\(pages.count) 页)")
                        .font(.headline)

                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 75), spacing: 10)], spacing: 10) {
                        ForEach(pages, id: \.self) { page in
                            NavigationLink(destination: ReaderView(document: document, initialPage: page)) {
                                Text("第 \(page) 页")
                                    .font(.subheadline)
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 8)
                                    .background(Color(red: 0.96, green: 0.97, blue: 0.99))
                                    .foregroundColor(.primary)
                                    .cornerRadius(8)
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 8)
                                            .stroke(Color.primary.opacity(0.1), lineWidth: 1)
                                    )
                            }
                        }
                    }
                }
            }
            .padding()
            .frame(maxWidth: 800)
        }
        .navigationTitle("文献目次")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            pages = db.fetchAvailablePages(for: document.id)
        }
    }

    private func metaRow(label: String, value: String) -> some View {
        HStack(spacing: 8) {
            Text(label)
                .font(.caption)
                .foregroundColor(.secondary)
                .frame(width: 60, alignment: .leading)
            Text(value)
                .font(.subheadline)
        }
    }

    private func performDocumentSearch() {
        let query = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else {
            searchResults = []
            return
        }
        searchResults = db.searchPages(query: query, documentId: document.id, limit: 80)
    }
}

private struct WrappingHStack: View {
    let tags: [String]

    var body: some View {
        HStack(spacing: 6) {
            ForEach(tags, id: \.self) { tag in
                Text("#" + tag)
                    .font(.caption2)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Color(red: 0.19, green: 0.36, blue: 0.96).opacity(0.12))
                    .foregroundColor(Color(red: 0.19, green: 0.36, blue: 0.96))
                    .cornerRadius(4)
            }
        }
    }
}
