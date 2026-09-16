import Foundation
import SQLite3

public final class DatabaseManager: @unchecked Sendable {
    public static let shared = DatabaseManager()

    private var db: OpaquePointer?
    private let dbQueue = DispatchQueue(label: "org.literae.mobile.db", qos: .userInitiated)

    public init(databaseURL: URL? = nil) {
        let url: URL
        if let customURL = databaseURL {
            url = customURL
        } else {
            let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
            let dir = appSupport.appendingPathComponent("LiteraeMobile", isDirectory: true)
            try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            url = dir.appendingPathComponent("library.sqlite3")
        }

        if sqlite3_open_v2(url.path, &db, SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_FULLMUTEX, nil) != SQLITE_OK {
            print("Failed to open SQLite database at \(url.path)")
        } else {
            initSchema()
        }
    }

    deinit {
        if let db = db {
            sqlite3_close_v2(db)
        }
    }

    private func initSchema() {
        let schema = """
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;

        CREATE TABLE IF NOT EXISTS documents (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            author TEXT,
            publisher TEXT,
            year TEXT,
            category TEXT,
            tags TEXT,
            page_count INTEGER
        );

        CREATE TABLE IF NOT EXISTS pages (
            document_id TEXT NOT NULL,
            page INTEGER NOT NULL,
            text TEXT NOT NULL,
            PRIMARY KEY (document_id, page)
        );

        CREATE INDEX IF NOT EXISTS idx_pages_doc ON pages(document_id);
        """
        execute(sql: schema)
    }

    @discardableResult
    public func execute(sql: String) -> Bool {
        var success = false
        dbQueue.sync {
            var err: UnsafeMutablePointer<CChar>?
            if sqlite3_exec(db, sql, nil, nil, &err) == SQLITE_OK {
                success = true
            } else if let err = err {
                print("SQLite error: \(String(cString: err))")
                sqlite3_free(err)
            }
        }
        return success
    }

    public func insertDocumentsBatch(_ documents: [Document]) {
        dbQueue.sync {
            sqlite3_exec(db, "BEGIN TRANSACTION", nil, nil, nil)
            let sql = "INSERT OR REPLACE INTO documents (id, title, author, publisher, year, category, tags, page_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?);"
            var stmt: OpaquePointer?
            if sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK {
                for doc in documents {
                    sqlite3_bind_text(stmt, 1, (doc.id as NSString).utf8String, -1, nil)
                    sqlite3_bind_text(stmt, 2, (doc.title as NSString).utf8String, -1, nil)
                    sqlite3_bind_text(stmt, 3, (doc.author as NSString).utf8String, -1, nil)
                    sqlite3_bind_text(stmt, 4, (doc.publisher as NSString).utf8String, -1, nil)
                    sqlite3_bind_text(stmt, 5, (doc.year as NSString).utf8String, -1, nil)
                    sqlite3_bind_text(stmt, 6, (doc.category as NSString).utf8String, -1, nil)
                    let tagsJson = (try? JSONSerialization.data(withJSONObject: doc.tags)) ?? Data()
                    let tagsStr = String(data: tagsJson, encoding: .utf8) ?? "[]"
                    sqlite3_bind_text(stmt, 7, (tagsStr as NSString).utf8String, -1, nil)
                    sqlite3_bind_int(stmt, 8, Int32(doc.pageCount))

                    sqlite3_step(stmt)
                    sqlite3_reset(stmt)
                }
            }
            sqlite3_finalize(stmt)
            sqlite3_exec(db, "COMMIT", nil, nil, nil)
        }
    }

    public func insertPagesBatch(_ pages: [PageRecord]) {
        dbQueue.sync {
            sqlite3_exec(db, "BEGIN TRANSACTION", nil, nil, nil)
            let sql = "INSERT OR REPLACE INTO pages (document_id, page, text) VALUES (?, ?, ?);"
            var stmt: OpaquePointer?
            if sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK {
                for page in pages {
                    sqlite3_bind_text(stmt, 1, (page.documentId as NSString).utf8String, -1, nil)
                    sqlite3_bind_int(stmt, 2, Int32(page.page))
                    sqlite3_bind_text(stmt, 3, (page.text as NSString).utf8String, -1, nil)

                    sqlite3_step(stmt)
                    sqlite3_reset(stmt)
                }
            }
            sqlite3_finalize(stmt)
            sqlite3_exec(db, "COMMIT", nil, nil, nil)
        }
    }

    public func fetchAllDocuments() -> [Document] {
        var list: [Document] = []
        dbQueue.sync {
            let sql = "SELECT id, title, author, publisher, year, category, tags, page_count FROM documents ORDER BY title COLLATE NOCASE;"
            var stmt: OpaquePointer?
            if sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK {
                while sqlite3_step(stmt) == SQLITE_ROW {
                    let id = String(cString: sqlite3_column_text(stmt, 0))
                    let title = String(cString: sqlite3_column_text(stmt, 1))
                    let author = sqlite3_column_text(stmt, 2).map { String(cString: $0) } ?? ""
                    let publisher = sqlite3_column_text(stmt, 3).map { String(cString: $0) } ?? ""
                    let year = sqlite3_column_text(stmt, 4).map { String(cString: $0) } ?? ""
                    let category = sqlite3_column_text(stmt, 5).map { String(cString: $0) } ?? ""
                    let tagsRaw = sqlite3_column_text(stmt, 6).map { String(cString: $0) } ?? "[]"
                    let tags: [String] = (try? JSONDecoder().decode([String].self, from: Data(tagsRaw.utf8))) ?? []
                    let pageCount = Int(sqlite3_column_int(stmt, 7))

                    list.append(Document(id: id, title: title, author: author, publisher: publisher, year: year, category: category, tags: tags, pageCount: pageCount))
                }
            }
            sqlite3_finalize(stmt)
        }
        return list
    }

    public func fetchAvailablePages(for documentId: String) -> [Int] {
        var pages: [Int] = []
        dbQueue.sync {
            let sql = "SELECT page FROM pages WHERE document_id = ? ORDER BY page ASC;"
            var stmt: OpaquePointer?
            if sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK {
                sqlite3_bind_text(stmt, 1, (documentId as NSString).utf8String, -1, nil)
                while sqlite3_step(stmt) == SQLITE_ROW {
                    pages.append(Int(sqlite3_column_int(stmt, 0)))
                }
            }
            sqlite3_finalize(stmt)
        }
        return pages
    }

    public func fetchPageText(documentId: String, page: Int) -> String? {
        var text: String?
        dbQueue.sync {
            let sql = "SELECT text FROM pages WHERE document_id = ? AND page = ? LIMIT 1;"
            var stmt: OpaquePointer?
            if sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK {
                sqlite3_bind_text(stmt, 1, (documentId as NSString).utf8String, -1, nil)
                sqlite3_bind_int(stmt, 2, Int32(page))
                if sqlite3_step(stmt) == SQLITE_ROW {
                    if let cStr = sqlite3_column_text(stmt, 0) {
                        text = String(cString: cStr)
                    }
                }
            }
            sqlite3_finalize(stmt)
        }
        return text
    }

    public func searchPages(query: String, limit: Int = 60) -> [(document: Document, page: Int, text: String)] {
        let terms = query.components(separatedBy: .whitespacesAndNewlines).filter { !$0.isEmpty }
        guard !terms.isEmpty else { return [] }

        var results: [(document: Document, page: Int, text: String)] = []
        dbQueue.sync {
            var whereClauses: [String] = []
            for _ in terms {
                whereClauses.append("p.text LIKE ?")
            }
            let whereSql = whereClauses.joined(separator: " AND ")
            let sql = """
            SELECT d.id, d.title, d.author, d.publisher, d.year, d.category, d.tags, d.page_count, p.page, p.text
            FROM pages AS p
            INNER JOIN documents AS d ON d.id = p.document_id
            WHERE \(whereSql)
            LIMIT ?;
            """

            var stmt: OpaquePointer?
            if sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK {
                for (index, term) in terms.enumerated() {
                    let pattern = "%\(term)%"
                    sqlite3_bind_text(stmt, Int32(index + 1), (pattern as NSString).utf8String, -1, nil)
                }
                sqlite3_bind_int(stmt, Int32(terms.count + 1), Int32(limit))

                while sqlite3_step(stmt) == SQLITE_ROW {
                    let docId = String(cString: sqlite3_column_text(stmt, 0))
                    let title = String(cString: sqlite3_column_text(stmt, 1))
                    let author = sqlite3_column_text(stmt, 2).map { String(cString: $0) } ?? ""
                    let publisher = sqlite3_column_text(stmt, 3).map { String(cString: $0) } ?? ""
                    let year = sqlite3_column_text(stmt, 4).map { String(cString: $0) } ?? ""
                    let category = sqlite3_column_text(stmt, 5).map { String(cString: $0) } ?? ""
                    let tagsRaw = sqlite3_column_text(stmt, 6).map { String(cString: $0) } ?? "[]"
                    let tags: [String] = (try? JSONDecoder().decode([String].self, from: Data(tagsRaw.utf8))) ?? []
                    let pageCount = Int(sqlite3_column_int(stmt, 7))

                    let doc = Document(id: docId, title: title, author: author, publisher: publisher, year: year, category: category, tags: tags, pageCount: pageCount)
                    let page = Int(sqlite3_column_int(stmt, 8))
                    let text = String(cString: sqlite3_column_text(stmt, 9))

                    results.append((document: doc, page: page, text: text))
                }
            }
            sqlite3_finalize(stmt)
        }
        return results
    }

    public func clearAllData() {
        execute(sql: "DELETE FROM pages; DELETE FROM documents; VACUUM;")
    }
}
