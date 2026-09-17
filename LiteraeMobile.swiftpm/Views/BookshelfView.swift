import SwiftUI

public enum LibraryMode: String, CaseIterable, Identifiable {
    case shelf = "书架"
    case search = "全库检索"

    public var id: String { rawValue }
}

public enum SearchSort: String, CaseIterable, Identifiable {
    case matchCount = "匹配数（多到少）"
    case latest = "最近导入"
    case titleAsc = "题名（正序）"
    case titleDesc = "题名（倒序）"
    case yearDesc = "出版时间（新到旧）"
    case yearAsc = "出版时间（旧到新）"

    public var id: String { rawValue }
}

public struct DocumentSearchGroup: Identifiable {
    public var id: String { document.id }
    public let document: Document
    public var matches: [(page: Int, text: String)]
    public var isExpanded: Bool = false
}

public struct BookshelfView: View {
    @State private var mode: LibraryMode = .shelf
    @State private var documents: [Document] = []
    @State private var selectedFacet: String? = nil
    @State private var searchQuery: String = ""
    @State private var searchGroups: [DocumentSearchGroup] = []
    @State private var searchSort: SearchSort = .matchCount

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
                    Button(action: { searchQuery = ""; searchGroups = [] }) {
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
                Text(searchGroups.isEmpty ? "输入关键词开始检索" : "共在 \(searchGroups.count) 部文献中找到 \(totalMatchCount) 处匹配")
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
                    ForEach($searchGroups) { $group in
                        DocumentSearchGroupCard(group: $group, query: searchQuery)
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

    private var totalMatchCount: Int {
        searchGroups.reduce(0) { $0 + $1.matches.count }
    }

    private func performSearch() {
        guard !searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            searchGroups = []
            return
        }
        let rawResults = db.searchPages(query: searchQuery, limit: 300)
        groupAndSortResults(rawResults: rawResults)
    }

    private func groupAndSortResults(rawResults: [(document: Document, page: Int, text: String)]) {
        var groupsDict: [String: DocumentSearchGroup] = [:]
        var order: [String] = []
        for result in rawResults {
            if var existing = groupsDict[result.document.id] {
                existing.matches.append((page: result.page, text: result.text))
                groupsDict[result.document.id] = existing
            } else {
                groupsDict[result.document.id] = DocumentSearchGroup(
                    document: result.document,
                    matches: [(page: result.page, text: result.text)]
                )
                order.append(result.document.id)
            }
        }
        var groups = order.compactMap { groupsDict[$0] }
        for i in 0..<groups.count {
            groups[i].matches.sort { $0.page < $1.page }
        }
        sortGroups(&groups)
        searchGroups = groups
    }

    private func sortResults() {
        var groups = searchGroups
        sortGroups(&groups)
        searchGroups = groups
    }

    private func sortGroups(_ groups: inout [DocumentSearchGroup]) {
        switch searchSort {
        case .matchCount:
            let terms = searchQuery.split(whereSeparator: { $0.isWhitespace }).map { String($0).lowercased() }
            groups.sort { a, b in
                let aTitle = a.document.title.lowercased()
                let bTitle = b.document.title.lowercased()
                let aTitleHits = terms.filter { aTitle.contains($0) }.count
                let bTitleHits = terms.filter { bTitle.contains($0) }.count
                let aScore = a.matches.count + aTitleHits * 10
                let bScore = b.matches.count + bTitleHits * 10
                if aScore != bScore { return aScore > bScore }
                if a.matches.count != b.matches.count { return a.matches.count > b.matches.count }
                return a.document.title.localizedStandardCompare(b.document.title) == .orderedAscending
            }
        case .latest:
            let docOrder = Dictionary(uniqueKeysWithValues: documents.enumerated().map { ($0.element.id, $0.offset) })
            groups.sort {
                (docOrder[$0.document.id] ?? 999999) < (docOrder[$1.document.id] ?? 999999)
            }
        case .titleAsc:
            groups.sort {
                $0.document.title.localizedStandardCompare($1.document.title) == .orderedAscending
            }
        case .titleDesc:
            groups.sort {
                $0.document.title.localizedStandardCompare($1.document.title) == .orderedDescending
            }
        case .yearDesc:
            let (dated, undated) = partitionByYear(groups)
            groups = dated.sorted {
                extractYear($0.document.year) > extractYear($1.document.year)
            } + undated.sorted {
                $0.document.title.localizedStandardCompare($1.document.title) == .orderedAscending
            }
        case .yearAsc:
            let (dated, undated) = partitionByYear(groups)
            groups = dated.sorted {
                extractYear($0.document.year) < extractYear($1.document.year)
            } + undated.sorted {
                $0.document.title.localizedStandardCompare($1.document.title) == .orderedAscending
            }
        }
    }

    private func extractYear(_ str: String) -> Int {
        guard let range = str.range(of: #"\d{4}"#, options: .regularExpression),
              let year = Int(str[range]) else { return 0 }
        return year
    }

    private func partitionByYear(_ groups: [DocumentSearchGroup]) -> (dated: [DocumentSearchGroup], undated: [DocumentSearchGroup]) {
        var dated: [DocumentSearchGroup] = []
        var undated: [DocumentSearchGroup] = []
        for g in groups {
            if extractYear(g.document.year) > 0 {
                dated.append(g)
            } else {
                undated.append(g)
            }
        }
        return (dated, undated)
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

// 文献检索聚合卡片（多命中折叠展开）
struct DocumentSearchGroupCard: View {
    @Binding var group: DocumentSearchGroup
    let query: String

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // 头部：分类、标题、作者出版信息、命中数
            HStack(alignment: .top, spacing: 10) {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        if !group.document.category.isEmpty {
                            Text(group.document.category)
                                .font(.system(size: 11, weight: .medium))
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(Color.primary.opacity(0.06))
                                .foregroundColor(.secondary)
                                .cornerRadius(4)
                        }
                        Text(group.document.title)
                            .font(.headline)
                            .fontWeight(.bold)
                            .foregroundColor(.primary)
                    }
                    if !group.document.metaDisplay.isEmpty {
                        Text(group.document.metaDisplay)
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
                Spacer()
                Text("共 \(group.matches.count) 处匹配")
                    .font(.caption)
                    .fontWeight(.semibold)
                    .foregroundColor(Color(red: 0.19, green: 0.36, blue: 0.96))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(Color(red: 0.19, green: 0.36, blue: 0.96).opacity(0.1))
                    .cornerRadius(12)
            }

            Divider()

            // 命中项列表：前 3 项
            let previewMatches = Array(group.matches.prefix(3))
            ForEach(Array(previewMatches.enumerated()), id: \.offset) { item in
                NavigationLink(destination: ReaderView(document: group.document, initialPage: item.element.page, terms: [query])) {
                    matchRow(page: item.element.page, text: item.element.text)
                }
                .buttonStyle(.plain)
            }

            // 超出部分折叠展开
            if group.matches.count > 3 {
                if group.isExpanded {
                    let remainingMatches = Array(group.matches.dropFirst(3))
                    ForEach(Array(remainingMatches.enumerated()), id: \.offset) { item in
                        NavigationLink(destination: ReaderView(document: group.document, initialPage: item.element.page, terms: [query])) {
                            matchRow(page: item.element.page, text: item.element.text)
                        }
                        .buttonStyle(.plain)
                    }
                }

                Button(action: {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        group.isExpanded.toggle()
                    }
                }) {
                    HStack {
                        Spacer()
                        Text(group.isExpanded ? "收起 ▴" : "展开其余 \(group.matches.count - 3) 处匹配 ▾")
                            .font(.caption)
                            .foregroundColor(.secondary)
                        Spacer()
                    }
                    .padding(.vertical, 6)
                    .background(Color.primary.opacity(0.03))
                    .cornerRadius(8)
                }
                .buttonStyle(.plain)
            }
        }
        .padding()
        .background(Color.white.opacity(0.95))
        .cornerRadius(14)
        .shadow(color: Color.black.opacity(0.04), radius: 4, x: 0, y: 2)
    }

    private func matchRow(page: Int, text: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text("第 \(page) 页")
                    .font(.caption)
                    .fontWeight(.semibold)
                    .foregroundColor(Color(red: 0.19, green: 0.36, blue: 0.96))
                Spacer()
                Text("查看页面 →")
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }
            Text(snippet(from: text, query: query))
                .font(.footnote)
                .foregroundColor(.primary.opacity(0.85))
                .lineLimit(2)
        }
        .padding(8)
        .background(Color.primary.opacity(0.02))
        .cornerRadius(8)
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.primary.opacity(0.06), lineWidth: 1))
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
