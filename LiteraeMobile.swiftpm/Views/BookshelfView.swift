import SwiftUI

public enum LibraryMode: String, CaseIterable, Identifiable {
    case shelf = "书架"
    case search = "全库检索"

    public var id: String { rawValue }
}

public enum SearchSort: String, CaseIterable, Identifiable {
    case relevance = "匹配度"
    case title = "书名"
    case page = "页码"

    public var id: String { rawValue }
}

public struct BookshelfView: View {
    @State private var mode: LibraryMode = .shelf
    @State private var documents: [Document] = []
    @State private var selectedFacet: String? = nil
    @State private var searchQuery: String = ""
    @State private var searchResults: [(document: Document, page: Int, text: String)] = []
    @State private var searchSort: SearchSort = .relevance

    private let db = DatabaseManager.shared

    public init() {}

    public var body: some View {
        VStack(spacing: 0) {
            // 顶部模式切换 (书架 / 检索)
            Picker("浏览模式", selection: $mode) {
                ForEach(LibraryMode.allCases) { m in
                    Text(m.rawValue).tag(m)
                }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal)
            .padding(.top, 10)
            .padding(.bottom, 6)

            // 分类胶囊滚动栏
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    facetPill(title: "全部 (\(documents.count))", isSelected: selectedFacet == nil) {
                        selectedFacet = nil
                    }

                    ForEach(extractedFacets, id: \.self) { facet in
                        facetPill(title: facet, isSelected: selectedFacet == facet) {
                            if selectedFacet == facet {
                                selectedFacet = nil
                            } else {
                                selectedFacet = facet
                            }
                        }
                    }
                }
                .padding(.horizontal)
                .padding(.vertical, 6)
            }

            Divider()

            // 主展示区域
            if mode == .shelf {
                shelfContent
            } else {
                searchContent
            }
        }
        .background(Color(red: 0.96, green: 0.97, blue: 0.99))
        .onAppear {
            refreshData()
        }
    }

    // 书架视图
    private var shelfContent: some View {
        ScrollView {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 300), spacing: 14)], spacing: 14) {
                ForEach(filteredDocuments) { doc in
                    NavigationLink(destination: DocumentDetailView(document: doc)) {
                        BookCardView(document: doc)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding()
            .frame(maxWidth: 1000)
        }
    }

    // 检索视图
    private var searchContent: some View {
        VStack(spacing: 0) {
            HStack {
                Image(systemName: "magnifyingglass")
                    .foregroundColor(Color(red: 0.19, green: 0.36, blue: 0.96))
                TextField("检索人名、地名、事件或文献原句", text: $searchQuery)
                    .textFieldStyle(.plain)
                    .onSubmit {
                        performSearch()
                    }
                if !searchQuery.isEmpty {
                    Button(action: { searchQuery = ""; searchResults = [] }) {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundColor(.secondary)
                    }
                }
                Button("检索", action: performSearch)
                    .font(.subheadline)
                    .fontWeight(.semibold)
                    .foregroundColor(Color(red: 0.19, green: 0.36, blue: 0.96))
            }
            .padding(10)
            .background(Color.white)
            .cornerRadius(12)
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.primary.opacity(0.12), lineWidth: 1))
            .padding()

            HStack {
                Text(searchResults.isEmpty ? "输入关键词开始检索" : "共 \(searchResults.count) 条结果")
                    .font(.caption)
                    .foregroundColor(.secondary)
                Spacer()
                Picker("结果排序", selection: $searchSort) {
                    ForEach(SearchSort.allCases) { option in
                        Text(option.rawValue).tag(option)
                    }
                }
                .pickerStyle(.menu)
                .onChange(of: searchSort) { _ in sortResults() }
            }
            .padding(.horizontal)
            .padding(.bottom, 8)

            ScrollView {
                LazyVStack(spacing: 12) {
                    ForEach(Array(searchResults.enumerated()), id: \.offset) { item in
                        NavigationLink(destination: ReaderView(document: item.element.document, initialPage: item.element.page, terms: [searchQuery])) {
                            SearchResultCard(result: item.element, query: searchQuery)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal)
                .padding(.bottom, 20)
                .frame(maxWidth: 900)
            }
        }
    }

    private func facetPill(title: String, isSelected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.caption)
                .fontWeight(isSelected ? .bold : .regular)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(isSelected ? Color(red: 0.19, green: 0.36, blue: 0.96) : Color.white.opacity(0.8))
                .foregroundColor(isSelected ? .white : .primary)
                .cornerRadius(16)
                .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.primary.opacity(0.1), lineWidth: 1))
        }
    }

    private var extractedFacets: [String] {
        var set = Set<String>()
        for doc in documents {
            if !doc.category.isEmpty { set.insert(doc.category) }
            for tag in doc.tags where !tag.isEmpty { set.insert("#" + tag) }
        }
        return Array(set).sorted()
    }

    private var filteredDocuments: [Document] {
        guard let facet = selectedFacet else { return documents }
        if facet.hasPrefix("#") {
            let tag = String(facet.dropFirst())
            return documents.filter { $0.tags.contains(tag) }
        } else {
            return documents.filter { $0.category == facet }
        }
    }

    private func refreshData() {
        documents = db.fetchAllDocuments()
    }

    private func performSearch() {
        guard !searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            searchResults = []
            return
        }
        searchResults = db.searchPages(query: searchQuery, limit: 200)
        sortResults()
    }

    private func sortResults() {
        switch searchSort {
        case .relevance:
            let terms = searchQuery.split(whereSeparator: { $0.isWhitespace }).map { String($0).lowercased() }
            searchResults.sort { relevanceScore($0, terms: terms) > relevanceScore($1, terms: terms) }
        case .title:
            searchResults.sort {
                let order = $0.document.title.localizedStandardCompare($1.document.title)
                return order == .orderedSame ? $0.page < $1.page : order == .orderedAscending
            }
        case .page:
            searchResults.sort {
                $0.page == $1.page
                    ? $0.document.title.localizedStandardCompare($1.document.title) == .orderedAscending
                    : $0.page < $1.page
            }
        }
    }

    private func relevanceScore(_ result: (document: Document, page: Int, text: String), terms: [String]) -> Int {
        let text = result.text.lowercased()
        let title = result.document.title.lowercased()
        return terms.reduce(0) { score, term in
            score + text.components(separatedBy: term).count - 1 + (title.contains(term) ? 5 : 0)
        }
    }
}

// 书籍卡片
struct BookCardView: View {
    let document: Document

    var body: some View {
        HStack(spacing: 12) {
            // 书脊色带
            RoundedRectangle(cornerRadius: 2)
                .fill(Color(red: 0.19, green: 0.36, blue: 0.96))
                .frame(width: 4)

            VStack(alignment: .leading, spacing: 6) {
                Text(document.title)
                    .font(.headline)
                    .lineLimit(2)
                    .foregroundColor(.primary)

                Text(document.metaDisplay)
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .lineLimit(1)

                HStack {
                    if !document.category.isEmpty {
                        Text(document.category)
                            .font(.caption2)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color(red: 0.19, green: 0.36, blue: 0.96).opacity(0.1))
                            .foregroundColor(Color(red: 0.19, green: 0.36, blue: 0.96))
                            .cornerRadius(4)
                    }
                    Spacer()
                    Text(document.pageCount > 0 ? "共 \(document.pageCount) 页" : "已收录")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
            }
            .padding(.vertical, 10)
            .padding(.trailing, 10)
        }
        .padding(.leading, 8)
        .background(Color.white.opacity(0.9))
        .cornerRadius(12)
        .shadow(color: Color.black.opacity(0.04), radius: 4, x: 0, y: 2)
    }
}

// 检索结果卡片
struct SearchResultCard: View {
    let result: (document: Document, page: Int, text: String)
    let query: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(result.document.title)
                    .font(.subheadline)
                    .fontWeight(.bold)
                Spacer()
                Text("第 \(result.page) 页")
                    .font(.caption)
                    .foregroundColor(Color(red: 0.19, green: 0.36, blue: 0.96))
                    .fontWeight(.semibold)
            }

            Text(snippet(from: result.text, query: query))
                .font(.footnote)
                .foregroundColor(.secondary)
                .lineLimit(3)
        }
        .padding()
        .background(Color.white.opacity(0.9))
        .cornerRadius(12)
        .shadow(color: Color.black.opacity(0.04), radius: 3, x: 0, y: 1)
    }

    private func snippet(from text: String, query: String) -> String {
        if let range = text.range(of: query, options: .caseInsensitive) {
            let start = text.index(range.lowerBound, offsetBy: -30, limitedBy: text.startIndex) ?? text.startIndex
            let end = text.index(range.upperBound, offsetBy: 60, limitedBy: text.endIndex) ?? text.endIndex
            return (start > text.startIndex ? "…" : "") + text[start..<end] + (end < text.endIndex ? "…" : "")
        }
        return String(text.prefix(90)) + "…"
    }
}
