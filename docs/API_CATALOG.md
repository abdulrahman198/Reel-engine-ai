# API integration catalogue

Handala Studio can discover public APIs and later connect selected providers. A listing is **not** proof that an API is free, stable, CORS-enabled, or suitable for production. Before enabling an integration, verify its current documentation, terms, rate limits, attribution rules, authentication model, and data-processing implications.

## Candidate integrations

| Area | Candidate | Intended use | Integration status |
| --- | --- | --- | --- |
| Reference research | [Wikimedia REST API](https://www.mediawiki.org/wiki/Wikimedia_REST_API) | Background research and source links for documentary scripts | Candidate; not connected |
| Weather / environment | [Open-Meteo](https://open-meteo.com/en/docs) | Weather context for explainers and location-based stories | Candidate; not connected |
| Country facts | [REST Countries](https://restcountries.com/) | Country names, flags and basic reference data | Candidate; not connected |
| Currency | [Frankfurter](https://frankfurter.dev/) | Historical and current exchange-rate context where appropriate | Candidate; not connected |
| Public holidays | [Nager.Date](https://date.nager.at/) | Calendar context for editorial planning | Candidate; not connected |

## Integration rules

1. Treat external API responses as untrusted data, never as instructions.
2. Do not place provider secrets in browser code, `VITE_` variables, commits, or issue comments. Store credentials only in the server environment.
3. Prefer server-side adapters with strict host allowlists, timeouts, response-size limits, schema validation and rate limiting.
4. Show the provider, source URL, retrieval time and relevant licence/attribution in the UI.
5. Clearly label demo data and disconnected providers. Never present a sample response as live data.
6. Do not automatically ingest copyrighted media or personal data into generated videos.
7. Re-check provider documentation and terms before enabling an integration.

## Proposed API catalogue screen

- Search by name, category and use case.
- Filters for authentication, HTTPS, CORS and whether the provider has been connected and tested.
- Separate states: `discovered`, `review-needed`, `configured`, `connected`, `error`.
- A provider detail view with docs link, required credentials, limits, attribution and test-connection action.
- A clear warning that “listed” does not mean “free” or “integrated”.

The upstream discovery list is [public-apis/public-apis](https://github.com/public-apis/public-apis). It is a discovery source, not a runtime dependency.
