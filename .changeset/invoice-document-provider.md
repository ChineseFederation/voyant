---
"@voyant-travel/finance": minor
"@voyant-travel/operator-standard": patch
---

Produce invoice documents on a deployment that has no accounting app.

`renderInvoice` wrote a `pending` rendition that nothing in the repository ever
fulfilled, and `POST /invoices/{id}/generate-document` answered HTTP 501 because
no deployment supplied a generator. Finance now declares the `document-renderer`
and `document-storage` resources it needs, offers a conformance-tested
`finance.invoice-document-provider` port selected as `invoiceDocumentArtifact:
"standard"` in `operator-standard`, renders in-process off `invoice.issued`, and
carries a one-minute recovery job for everything the in-process path misses.

A requested rendition is now fulfilled in place rather than orphaned beside a
separate `ready` row. When no renderer is available the miss is recorded on the
row as `failed`, so `?wait=true` and the booking-confirmation notification stop
waiting on work that will never happen. An invoice whose number is still awaiting
allocation by an installed accounting app is left alone rather than rendered
against a placeholder number.
