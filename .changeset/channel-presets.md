---
"@voyant-travel/distribution": minor
"@voyant-travel/distribution-react": minor
---

Offer the known networks as a catalog when adding a channel.

Creating a channel for GetYourGuide meant typing the name, guessing which `kind` it is out of a seven-value enum, and finding the website. Nothing about that was the operator's decision to make — the answers are the same on every deployment.

`GET /v1/admin/distribution/channels/presets` now serves the catalog: GetYourGuide, Viator, Tripadvisor, Klook, Civitatis, Musement, Airbnb Experiences and Voyant Connect as named networks, plus affiliate / reseller / API partner as shapes to start from. The add-channel sheet offers them and prefills name, kind and website, leaving everything editable.

They are a catalog and not seeded rows. A `channels` row is a commercial relationship carrying contracts, commission rules and settlement terms, so pre-creating one per network would fill the counterparty list with companies nobody has contracted with, each showing fields that mean nothing until someone signs something. Nothing exists until the operator picks it.

A row created from a named network records `channels.preset_key`. That is a stable identity a future connector can bind to — "the GetYourGuide channel" — rather than matching on a display name the operator is free to rename, which is what makes per-channel publication addressable by something other than a typeid. The key is unique, so a second channel for the same network is refused with a 409 naming the one that already exists, and it is set once: `updateChannelSchema` drops it, because re-pointing it would silently move whatever had bound to it.

The partner types deliberately write no key. An operator has many affiliates and none of them is *the* affiliate, so those presets fill in `kind` and claim no identity.

Direct is absent from the catalog: it is provisioned by migration and is not a counterparty.
