import SwiftUI

public struct DocumentDetailView: View {
    public let document: Document
    @State private var pages: [Int] = []
    @State private var selectedPageForReader: Int? = nil
    @State private var searchQuery: String = ""
    @State private var searchResults: [(document: Document, page: Int, text: String)] = []
    @State private var jumpPageText: String = ""
    @State private var targetJumpPage: Int? = nil
    @State private var showJumpAlert: Bool = false
    @State private var jumpAlertMessage: String = ""

    private let db = DatabaseManager.shared

    public init(document: Document) {
        self.document = document
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                if let target = targetJumpPage {
                    NavigationLink(
                        destination: ReaderView(document: document, initialPage: target),
                        isActive: Binding(
                            get: { targetJumpPage != nil },
                            set: { if !$0 { targetJumpPage = nil } }
                        )
                    ) {
                        EmptyView()
                    }
                    .hidden()
                }

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
                    HStack(alignment: .center) {
                        Text("页码")
                            .font(.headline)
                        if !pages.isEmpty {
                            Text("(\(pages.count) 页)")
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                        }

                        Spacer()

                        // 页码快速跳转
                        HStack(spacing: 6) {
                            TextField(document.pageCount > 0 ? "1-\(document.pageCount)" : "页码", text: $jumpPageText)
                                .keyboardType(.numberPad)
                                .textFieldStyle(.plain)
                                .multilineTextAlignment(.center)
                                .font(.subheadline)
                                .frame(width: 64, height: 32)
                                .background(Color.white)
                                .cornerRadius(8)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 8)
                                        .stroke(Color.primary.opacity(0.12), lineWidth: 1)
                                )
                                .onSubmit { jumpToPage() }

                            Button(action: jumpToPage) {
                                Text("跳转")
                                    .font(.subheadline)
                                    .fontWeight(.medium)
                                    .foregroundColor(.white)
                                    .padding(.horizontal, 10)
                                    .frame(height: 32)
                                    .background(Color(red: 0.72, green: 0.20, blue: 0.16))
                                    .cornerRadius(8)
                            }
                        }
                    }

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
        .alert(isPresented: $showJumpAlert) {
            Alert(title: Text("提示"), message: Text(jumpAlertMessage), dismissButton: .default(Text("确定")))
        }
        .onAppear {
            pages = db.fetchAvailablePages(for: document.id)
        }
    }

    private func jumpToPage() {
        let clean = jumpPageText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let page = Int(clean), page >= 1 else {
            jumpAlertMessage = "请输入有效的正整数页码"
            showJumpAlert = true
            return
        }
        if document.pageCount > 0 && page > document.pageCount {
            jumpAlertMessage = "该文献总共 \(document.pageCount) 页，请输入 1 至 \(document.pageCount) 之间的页码"
            showJumpAlert = true
            return
        }
        targetJumpPage = page
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
