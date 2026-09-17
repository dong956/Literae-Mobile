import SwiftUI

public enum ReadingTheme: String, CaseIterable, Identifiable {
    case paper = "宣纸"
    case cream = "柔白"
    case night = "夜读"

    public var id: String { rawValue }

    public var backgroundColor: Color {
        switch self {
        case .paper: return Color(red: 0.95, green: 0.92, blue: 0.85)
        case .cream: return Color(red: 0.98, green: 0.97, blue: 0.96)
        case .night: return Color(red: 0.11, green: 0.11, blue: 0.10)
        }
    }

    public var textColor: Color {
        switch self {
        case .paper: return Color(red: 0.14, green: 0.15, blue: 0.13)
        case .cream: return Color(red: 0.12, green: 0.13, blue: 0.12)
        case .night: return Color(red: 0.88, green: 0.86, blue: 0.82)
        }
    }
}

public struct ReaderView: View {
    public let document: Document
    @State public var currentPage: Int
    public let terms: [String]

    @State private var pageText: String = ""
    @State private var availablePages: [Int] = []
    @State private var fontSizeDelta: CGFloat = 0
    @State private var currentTheme: ReadingTheme = .paper
    @State private var showToast: Bool = false
    @State private var toastMessage: String = ""

    private let db = DatabaseManager.shared
    @Environment(\.dismiss) private var dismiss

    public init(document: Document, initialPage: Int, terms: [String] = []) {
        self.document = document
        self._currentPage = State(initialValue: initialPage)
        self.terms = terms
    }

    public var body: some View {
        ZStack {
            currentTheme.backgroundColor
                .ignoresSafeArea()

            VStack(spacing: 0) {
                // 顶部工具栏
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(document.title)
                            .font(.headline)
                            .lineLimit(1)
                            .foregroundColor(currentTheme.textColor)
                        Text(document.metaDisplay + " · 第 \(currentPage) 页")
                            .font(.caption)
                            .foregroundColor(Color(red: 0.19, green: 0.36, blue: 0.96))
                    }
                    Spacer()

                    // 字号切换
                    Button(action: cycleFontSize) {
                        Image(systemName: "textformat.size")
                            .padding(8)
                            .background(Color.primary.opacity(0.06))
                            .clipShape(Circle())
                    }

                    // 主题切换
                    Button(action: cycleTheme) {
                        Image(systemName: currentTheme == .night ? "moon.fill" : "sun.max.fill")
                            .padding(8)
                            .background(Color.primary.opacity(0.06))
                            .clipShape(Circle())
                    }

                    // 引用出处复制
                    Button(action: copyCitation) {
                        Label("引用", systemImage: "doc.on.doc")
                            .font(.subheadline)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(Color(red: 0.19, green: 0.36, blue: 0.96).opacity(0.12))
                            .foregroundColor(Color(red: 0.19, green: 0.36, blue: 0.96))
                            .cornerRadius(8)
                    }
                }
                .padding(.horizontal)
                .padding(.vertical, 10)
                .background(currentTheme.backgroundColor.opacity(0.95))
                .overlay(Rectangle().frame(height: 1).foregroundColor(Color.primary.opacity(0.08)), alignment: .bottom)

                // 正文阅读区域
                ScrollView {
                    Text(pageText)
                        .font(.system(size: 18 + fontSizeDelta, weight: .regular, design: .serif))
                        .lineSpacing(10 + fontSizeDelta * 0.4)
                        .foregroundColor(currentTheme.textColor)
                        .padding(.horizontal, 24)
                        .padding(.vertical, 20)
                        .frame(maxWidth: 720, alignment: .leading)
                        .textSelection(.enabled)
                }

                // 底部翻页导航
                HStack {
                    Button(action: goToPreviousPage) {
                        HStack(spacing: 4) {
                            Image(systemName: "chevron.left")
                            Text("上一页")
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                        .background(Color.primary.opacity(0.06))
                        .cornerRadius(20)
                    }
                    .disabled(!canGoPrevious)

                    Spacer()

                    Text("第 \(currentPage) 页 / 共 \(max(availablePages.count, 1)) 页")
                        .font(.footnote)
                        .foregroundColor(currentTheme.textColor.opacity(0.7))

                    Spacer()

                    Button(action: goToNextPage) {
                        HStack(spacing: 4) {
                            Text("下一页")
                            Image(systemName: "chevron.right")
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                        .background(Color.primary.opacity(0.06))
                        .cornerRadius(20)
                    }
                    .disabled(!canGoNext)
                }
                .padding(.horizontal)
                .padding(.vertical, 10)
                .background(currentTheme.backgroundColor.opacity(0.95))
                .overlay(Rectangle().frame(height: 1).foregroundColor(Color.primary.opacity(0.08)), alignment: .top)
            }

            // Toast 提示
            if showToast {
                VStack {
                    Spacer()
                    Text(toastMessage)
                        .font(.footnote)
                        .foregroundColor(.white)
                        .padding(.horizontal, 18)
                        .padding(.vertical, 10)
                        .background(Color.black.opacity(0.85))
                        .cornerRadius(25)
                        .padding(.bottom, 60)
                        .transition(.opacity)
                }
            }
        }
        .onAppear {
            loadAvailablePages()
            loadPageContent()
        }
    }

    private var currentIndex: Int {
        availablePages.firstIndex(of: currentPage) ?? 0
    }

    private var canGoPrevious: Bool {
        currentIndex > 0
    }

    private var canGoNext: Bool {
        currentIndex < availablePages.count - 1
    }

    private func loadAvailablePages() {
        availablePages = db.fetchAvailablePages(for: document.id)
    }

    private func loadPageContent() {
        pageText = db.fetchPageText(documentId: document.id, page: currentPage) ?? "（本页无已识别文本）"
    }

    private func goToPreviousPage() {
        guard canGoPrevious else { return }
        currentPage = availablePages[currentIndex - 1]
        loadPageContent()
    }

    private func goToNextPage() {
        guard canGoNext else { return }
        currentPage = availablePages[currentIndex + 1]
        loadPageContent()
    }

    private func cycleFontSize() {
        if fontSizeDelta >= 6 {
            fontSizeDelta = -2
        } else {
            fontSizeDelta += 2
        }
    }

    private func cycleTheme() {
        switch currentTheme {
        case .paper: currentTheme = .cream
        case .cream: currentTheme = .night
        case .night: currentTheme = .paper
        }
    }

    private func copyCitation() {
        let snippet = String(pageText.prefix(160)).trimmingCharacters(in: .whitespacesAndNewlines)
        let authorPart = document.author.isEmpty ? "" : "，\(document.author)"
        let yearPart = document.year.isEmpty ? "" : "，\(document.year)"
        let citation = "“\(snippet)”\n——《\(document.title)》\(authorPart)\(yearPart)，第 \(currentPage) 页。"

        #if canImport(UIKit)
        UIPasteboard.general.string = citation
        #endif

        toastMessage = "已复制出处引文到剪贴板"
        withAnimation { showToast = true }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.8) {
            withAnimation { showToast = false }
        }
    }
}
