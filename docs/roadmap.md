# Roadmap and limitations

## Prototype limitations

- Search currently scans locally stored pages. It is suitable for validating
  the workflow and medium collections, but a very large corpus will need a
  native SQLite n-gram index.
- The browser ZIP reader supports stored and standard DEFLATE entries. ZIP64
  packages larger than 4 GB are reserved for the native importer.
- Browsers may clear site data under storage pressure. This is not acceptable
  as the only long-term copy of a library.
- The prototype does not yet expose package replacement history or storage
  usage details.

## Production path

1. Keep the v1 ZIP contract unchanged.
2. Build a Flutter shell for iOS and Android.
3. Stream JSONL into a temporary SQLite database.
4. Build Chinese two-character and three-character search indexes during
   import, verify counts and checksums, then switch databases atomically.
5. Import through the iOS Files picker and Android Storage Access Framework.
6. Add TestFlight and Android internal-test builds before public store review.
