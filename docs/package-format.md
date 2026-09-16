# Literae Mobile Package v1

The package is a ZIP archive with exactly three root entries:

```text
manifest.json
documents.jsonl
pages.jsonl
```

`manifest.json` identifies `format` as `literae-mobile` and
`schema_version` as `1`. It records document/page counts and SHA-256 digests
for both JSONL files.

`documents.jsonl` contains one JSON object per line with these fields:

- `id`
- `title`
- `author`
- `publisher`
- `year`
- `category`
- `tags`
- `page_count`

`pages.jsonl` contains one non-empty OCR page per line:

- `document_id`
- `page`
- `text`

Readers must ignore unknown fields. They must reject unsupported major schema
versions rather than guessing. The format never contains source paths, PDF or
image data, API credentials, settings, logs, OCR errors, chat history, or
real-page mappings.
