# Voyant Database Schema Reference

> Auto-generated from Drizzle table definitions via `pnpm generate:schema-docs` on 2026-08-01.
> SQL column names are shown first; TypeScript property names are included when they differ.
> Constraint markers are derived from the schema source, not from a live database introspection run.

## IAM & Auth

### `account` (Better Auth)
| Column | Type |
|--------|------|
| `id` | text • PK • not null |
| `account_id` (`accountId`) | text • not null |
| `provider_id` (`providerId`) | text • not null |
| `user_id` (`userId`) | text • FK -> user.id • not null |
| `access_token` (`accessToken`) | text • nullable |
| `refresh_token` (`refreshToken`) | text • nullable |
| `id_token` (`idToken`) | text • nullable |
| `access_token_expires_at` (`accessTokenExpiresAt`) | timestamp with time zone • nullable |
| `refresh_token_expires_at` (`refreshTokenExpiresAt`) | timestamp with time zone • nullable |
| `scope` | text • nullable |
| `password` | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null |

### `apikey` (Better Auth API key)
| Column | Type |
|--------|------|
| `id` | text • PK • not null |
| `config_id` (`configId`) | text • not null • default "default" |
| `name` | text • nullable |
| `start` | text • nullable |
| `prefix` | text • nullable |
| `key` | text • not null |
| `reference_id` (`referenceId`) | text • not null |
| `refill_interval` (`refillInterval`) | integer • nullable |
| `refill_amount` (`refillAmount`) | integer • nullable |
| `last_refill_at` (`lastRefillAt`) | timestamp with time zone • nullable |
| `enabled` | boolean • not null • default true |
| `rate_limit_enabled` (`rateLimitEnabled`) | boolean • not null • default false |
| `rate_limit_time_window` (`rateLimitTimeWindow`) | integer • nullable |
| `rate_limit_max` (`rateLimitMax`) | integer • nullable |
| `request_count` (`requestCount`) | integer • not null • default 0 |
| `remaining` | integer • nullable |
| `last_request` (`lastRequest`) | timestamp with time zone • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null |
| `expires_at` (`expiresAt`) | timestamp with time zone • nullable |
| `permissions` | text • nullable |
| `metadata` | text • nullable |

### `invitation` (Better Auth organization plugin)
| Column | Type |
|--------|------|
| `id` | text • PK • not null |
| `email` | text • not null |
| `inviter_id` (`inviterId`) | text • FK -> user.id • not null |
| `organization_id` (`organizationId`) | text • FK -> organization.id • not null |
| `role` | text • not null |
| `status` | text • not null • default "pending" |
| `expires_at` (`expiresAt`) | timestamp with time zone • not null |
| `created_at` (`createdAt`) | timestamp with time zone • not null |

### `member` (Better Auth organization plugin)
| Column | Type |
|--------|------|
| `id` | text • PK • not null |
| `user_id` (`userId`) | text • FK -> user.id • not null |
| `organization_id` (`organizationId`) | text • FK -> organization.id • not null |
| `role` | text • not null • default "member" |
| `created_at` (`createdAt`) | timestamp with time zone • not null |

### `organization` (Better Auth organization plugin)
| Column | Type |
|--------|------|
| `id` | text • PK • not null |
| `name` | text • not null |
| `slug` | text • unique • not null |
| `logo` | text • nullable |
| `metadata` | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null |

### `session` (Better Auth)
| Column | Type |
|--------|------|
| `id` | text • PK • not null |
| `expires_at` (`expiresAt`) | timestamp with time zone • not null |
| `token` | text • unique • not null |
| `created_at` (`createdAt`) | timestamp with time zone • not null |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null |
| `ip_address` (`ipAddress`) | text • nullable |
| `user_agent` (`userAgent`) | text • nullable |
| `user_id` (`userId`) | text • FK -> user.id • not null |
| `active_organization_id` (`activeOrganizationId`) | text • nullable |

### `user` (Better Auth)
| Column | Type |
|--------|------|
| `id` | text • PK • not null |
| `name` | text • not null |
| `email` | text • nullable |
| `email_verified` (`emailVerified`) | boolean • not null |
| `phone_number` (`phoneNumber`) | text • nullable |
| `phone_number_verified` (`phoneNumberVerified`) | boolean • not null • default false |
| `image` | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null |

### `user_profiles`
| Column | Type |
|--------|------|
| `id` | text • PK • FK -> user.id • not null |
| `first_name` (`firstName`) | text • nullable |
| `last_name` (`lastName`) | text • nullable |
| `avatar_url` (`avatarUrl`) | text • nullable |
| `locale` | text • not null • default "en" |
| `timezone` | text • nullable |
| `ui_prefs` (`uiPrefs`) | jsonb • nullable • default |
| `seating_preference` (`seatingPreference`) | seating_preference • nullable |
| `is_super_admin` (`isSuperAdmin`) | boolean • not null • default false |
| `is_support_user` (`isSupportUser`) | boolean • not null • default false |
| `permissions` | jsonb • nullable |
| `terms_accepted_at` (`termsAcceptedAt`) | timestamp with time zone • nullable |
| `notification_defaults` (`notificationDefaults`) | jsonb • nullable • default |
| `marketing_consent` (`marketingConsent`) | boolean • not null • default false |
| `marketing_consent_at` (`marketingConsentAt`) | timestamp with time zone • nullable |
| `marketing_consent_source` (`marketingConsentSource`) | text • nullable |
| `last_active_at` (`lastActiveAt`) | timestamp with time zone • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `verification` (Better Auth)
| Column | Type |
|--------|------|
| `id` | text • PK • not null |
| `identifier` | text • not null |
| `value` | text • not null |
| `expires_at` (`expiresAt`) | timestamp with time zone • not null |
| `created_at` (`createdAt`) | timestamp with time zone • nullable |
| `updated_at` (`updatedAt`) | timestamp with time zone • nullable |

## Infrastructure

### `domains`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `domain` | text • not null |
| `status` | domain_status • not null • default "pending" |
| `provider` | domain_provider • nullable • default "cloudflare" |
| `provider_hostname_id` (`providerHostnameId`) | text • nullable |
| `provider_zone_id` (`providerZoneId`) | text • nullable |
| `certificate_status` (`certificateStatus`) | text • nullable |
| `hostname_status` (`hostnameStatus`) | text • nullable |
| `verification_records` (`verificationRecords`) | jsonb • nullable |
| `custom_metadata` (`customMetadata`) | jsonb • nullable |
| `email_provider` (`emailProvider`) | email_provider • nullable |
| `email_region` (`emailRegion`) | resend_region • nullable |
| `email_provider_domain_id` (`emailProviderDomainId`) | text • nullable |
| `email_return_path_domain` (`emailReturnPathDomain`) | text • nullable |
| `email_tracking_domain` (`emailTrackingDomain`) | text • nullable |
| `email_dmarc_policy` (`emailDmarcPolicy`) | text • nullable |
| `email_click_tracking` (`emailClickTracking`) | boolean • not null • default false |
| `email_open_tracking` (`emailOpenTracking`) | boolean • not null • default false |
| `email_tls_mode` (`emailTlsMode`) | tls_mode • nullable • default "opportunistic" |
| `email_config_encrypted` (`emailConfigEncrypted`) | text • nullable |
| `email_notes` (`emailNotes`) | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `email_domain_records`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `domain_id` (`domainId`) | text • FK -> domains.id • not null |
| `record_type` (`recordType`) | email_record_type • not null |
| `host` | text • not null |
| `expected_value` (`expectedValue`) | text • not null |
| `status` | email_record_status • not null • default "pending" |
| `last_checked_at` (`lastCheckedAt`) | timestamp with time zone • nullable |
| `error_message` (`errorMessage`) | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |

Constraints:
- Unique: `domain_id`, `host`, `record_type`

### `webhook_subscriptions`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `url` | text • not null |
| `events` | text[] • not null • default |
| `secret` | text • not null |
| `active` | boolean • not null • default true |
| `max_retries` (`maxRetries`) | integer • not null • default 5 |
| `headers` | jsonb • nullable |
| `description` | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |
| `last_delivery_at` (`lastDeliveryAt`) | timestamp with time zone • nullable |
| `failure_count` (`failureCount`) | integer • not null • default 0 |

## Relationships

### `activities`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `subject` | text • not null |
| `type` | activity_type • not null |
| `owner_id` (`ownerId`) | text • nullable |
| `status` | activity_status • not null • default "planned" |
| `due_at` (`dueAt`) | timestamp with time zone • nullable |
| `completed_at` (`completedAt`) | timestamp with time zone • nullable |
| `location` | text • nullable |
| `description` | text • nullable |
| `custom_fields` (`customFields`) | jsonb • not null • default |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `activity_links`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `activity_id` (`activityId`) | text • FK -> activities.id • not null |
| `entity_type` (`entityType`) | entity_type • not null |
| `entity_id` (`entityId`) | text • not null |
| `role` | activity_link_role • not null • default "related" |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |

### `activity_participants`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `activity_id` (`activityId`) | text • FK -> activities.id • not null |
| `person_id` (`personId`) | text • FK -> people.id • not null |
| `is_primary` (`isPrimary`) | boolean • not null • default false |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |

### `communication_log`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `person_id` (`personId`) | text • FK -> people.id • not null |
| `organization_id` (`organizationId`) | text • FK -> organizations.id • nullable |
| `channel` | communication_channel • not null |
| `direction` | communication_direction • not null |
| `subject` | text • nullable |
| `content` | text • nullable |
| `sent_at` (`sentAt`) | timestamp with time zone • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |

### `customer_signals`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `person_id` (`personId`) | text • FK -> people.id • not null |
| `product_id` (`productId`) | text • nullable |
| `option_unit_id` (`optionUnitId`) | text • nullable |
| `kind` | customer_signal_kind • not null |
| `source` | customer_signal_source • not null |
| `status` | customer_signal_status • not null • default "new" |
| `priority` | text • not null • default "normal" |
| `notes` | text • nullable |
| `tags` | jsonb • not null • default [] |
| `assigned_to_user_id` (`assignedToUserId`) | text • nullable |
| `follow_up_at` (`followUpAt`) | timestamp with time zone • nullable |
| `resolved_booking_id` (`resolvedBookingId`) | text • nullable |
| `source_submission_id` (`sourceSubmissionId`) | text • nullable |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `organization_notes`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `organization_id` (`organizationId`) | text • FK -> organizations.id • not null |
| `author_id` (`authorId`) | text • not null |
| `content` | text • not null |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |

### `organizations`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `name` | text • not null |
| `legal_name` (`legalName`) | text • nullable |
| `website` | text • nullable |
| `tax_id` (`taxId`) | text • nullable |
| `industry` | text • nullable |
| `relation` | relation_type • nullable |
| `owner_id` (`ownerId`) | text • nullable |
| `default_currency` (`defaultCurrency`) | text • nullable |
| `preferred_language` (`preferredLanguage`) | text • nullable |
| `payment_terms` (`paymentTerms`) | integer • nullable |
| `status` | record_status • not null • default "active" |
| `source` | text • nullable |
| `source_ref` (`sourceRef`) | text • nullable |
| `tags` | jsonb • not null • default [] |
| `custom_fields` (`customFields`) | jsonb • not null • default |
| `notes` | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |
| `archived_at` (`archivedAt`) | timestamp with time zone • nullable |

### `people`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `organization_id` (`organizationId`) | text • FK -> organizations.id • nullable |
| `first_name` (`firstName`) | text • not null |
| `middle_name` (`middleName`) | text • nullable |
| `last_name` (`lastName`) | text • not null |
| `gender` | text • nullable |
| `job_title` (`jobTitle`) | text • nullable |
| `relation` | relation_type • nullable |
| `preferred_language` (`preferredLanguage`) | text • nullable |
| `preferred_currency` (`preferredCurrency`) | text • nullable |
| `owner_id` (`ownerId`) | text • nullable |
| `status` | record_status • not null • default "active" |
| `source` | text • nullable |
| `source_ref` (`sourceRef`) | text • nullable |
| `tags` | jsonb • not null • default [] |
| `custom_fields` (`customFields`) | jsonb • not null • default |
| `date_of_birth` (`dateOfBirth`) | date • nullable |
| `notes` | text • nullable |
| `accessibility_encrypted` (`accessibilityEncrypted`) | jsonb • nullable |
| `dietary_encrypted` (`dietaryEncrypted`) | jsonb • nullable |
| `loyalty_encrypted` (`loyaltyEncrypted`) | jsonb • nullable |
| `insurance_encrypted` (`insuranceEncrypted`) | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |
| `archived_at` (`archivedAt`) | timestamp with time zone • nullable |

### `person_documents`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `person_id` (`personId`) | text • FK -> people.id • not null |
| `type` | person_document_type • not null |
| `number_encrypted` (`numberEncrypted`) | jsonb • nullable |
| `issuing_authority` (`issuingAuthority`) | text • nullable |
| `issuing_country` (`issuingCountry`) | text • nullable |
| `issue_date` (`issueDate`) | date • nullable |
| `expiry_date` (`expiryDate`) | date • nullable |
| `attachment_id` (`attachmentId`) | text • nullable |
| `is_primary` (`isPrimary`) | boolean • not null • default false |
| `notes` | text • nullable |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `person_notes`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `person_id` (`personId`) | text • FK -> people.id • not null |
| `author_id` (`authorId`) | text • not null |
| `content` | text • not null |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |

### `person_payment_methods`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `person_id` (`personId`) | text • FK -> people.id • not null |
| `brand` | text • not null |
| `last4` | text • nullable |
| `holder_name` (`holderName`) | text • nullable |
| `exp_month` (`expMonth`) | integer • nullable |
| `exp_year` (`expYear`) | integer • nullable |
| `processor_token` (`processorToken`) | text • not null |
| `is_default` (`isDefault`) | boolean • not null • default false |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |

### `person_relationships`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `from_person_id` (`fromPersonId`) | text • FK -> people.id • not null |
| `to_person_id` (`toPersonId`) | text • FK -> people.id • not null |
| `kind` | person_relationship_kind • not null |
| `inverse_kind` (`inverseKind`) | person_relationship_kind • nullable |
| `start_date` (`startDate`) | date • nullable |
| `end_date` (`endDate`) | date • nullable |
| `is_primary` (`isPrimary`) | boolean • not null • default false |
| `notes` | text • nullable |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `segment_members`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `segment_id` (`segmentId`) | text • FK -> segments.id • not null |
| `person_id` (`personId`) | text • FK -> people.id • not null |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |

### `segments`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `name` | text • not null |
| `description` | text • nullable |
| `conditions` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

## Proposals

### `booking_proposal_details`
| Column | Type |
|--------|------|
| `booking_id` (`bookingId`) | text • PK • not null |
| `proposal_id` (`proposalId`) | text • nullable |
| `proposal_version_id` (`proposalVersionId`) | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `pipelines`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `entity_type` (`entityType`) | entity_type • not null • default "proposal" |
| `name` | text • not null |
| `is_default` (`isDefault`) | boolean • not null • default false |
| `sort_order` (`sortOrder`) | integer • not null • default 0 |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `proposal_delivery_requests`
| Column | Type |
|--------|------|
| `id` | text • PK • not null |
| `command_scope` (`commandScope`) | text • not null |
| `command_idempotency_key` (`commandIdempotencyKey`) | text • not null |
| `request_fingerprint` (`requestFingerprint`) | text • not null |
| `claim_action_id` (`claimActionId`) | text • not null |
| `organization_id` (`organizationId`) | text • nullable |
| `target_type` (`targetType`) | text • not null |
| `target_id` (`targetId`) | text • not null |
| `proposal_id` (`proposalId`) | text • FK -> proposals.id • not null |
| `proposal_version_id` (`proposalVersionId`) | text • FK -> proposal_versions.id • not null |
| `proposal_url` (`proposalUrl`) | text • not null |
| `provider` | text • not null |
| `result_snapshot` (`resultSnapshot`) | jsonb • not null |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `completed_at` (`completedAt`) | timestamp with time zone • nullable |

### `proposal_media`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `proposal_id` (`proposalId`) | text • FK -> proposals.id • not null |
| `media_type` (`mediaType`) | text • not null |
| `name` | text • not null |
| `url` | text • not null |
| `storage_key` (`storageKey`) | text • nullable |
| `mime_type` (`mimeType`) | text • nullable |
| `file_size` (`fileSize`) | integer • nullable |
| `alt_text` (`altText`) | text • nullable |
| `sort_order` (`sortOrder`) | integer • not null • default 0 |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `proposal_participants`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `proposal_id` (`proposalId`) | text • FK -> proposals.id • not null |
| `person_id` (`personId`) | text • not null |
| `role` | participant_role • not null • default "other" |
| `is_primary` (`isPrimary`) | boolean • not null • default false |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |

### `proposal_products`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `proposal_id` (`proposalId`) | text • FK -> proposals.id • not null |
| `product_id` (`productId`) | text • nullable |
| `supplier_service_id` (`supplierServiceId`) | text • nullable |
| `name_snapshot` (`nameSnapshot`) | text • not null |
| `description` | text • nullable |
| `quantity` | integer • not null • default 1 |
| `unit_price_amount_cents` (`unitPriceAmountCents`) | integer • nullable |
| `cost_amount_cents` (`costAmountCents`) | integer • nullable |
| `currency` | text • nullable |
| `discount_amount_cents` (`discountAmountCents`) | integer • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `proposal_version_lines`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `proposal_version_id` (`proposalVersionId`) | text • FK -> proposal_versions.id • not null |
| `product_id` (`productId`) | text • nullable |
| `supplier_service_id` (`supplierServiceId`) | text • nullable |
| `description` | text • not null |
| `quantity` | integer • not null • default 1 |
| `unit_price_amount_cents` (`unitPriceAmountCents`) | integer • not null • default 0 |
| `total_amount_cents` (`totalAmountCents`) | integer • not null • default 0 |
| `currency` | text • not null |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `proposal_versions`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `proposal_id` (`proposalId`) | text • FK -> proposals.id • not null |
| `label` | text • nullable |
| `status` | proposal_version_status • not null • default "draft" |
| `supersedes_id` (`supersedesId`) | text • FK -> proposal_versions.id • nullable |
| `trip_snapshot_id` (`tripSnapshotId`) | text • nullable |
| `valid_until` (`validUntil`) | date • nullable |
| `currency` | text • not null |
| `subtotal_amount_cents` (`subtotalAmountCents`) | integer • not null • default 0 |
| `tax_amount_cents` (`taxAmountCents`) | integer • not null • default 0 |
| `total_amount_cents` (`totalAmountCents`) | integer • not null • default 0 |
| `notes` | text • nullable |
| `sent_at` (`sentAt`) | timestamp with time zone • nullable |
| `viewed_at` (`viewedAt`) | timestamp with time zone • nullable |
| `decided_at` (`decidedAt`) | timestamp with time zone • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |
| `archived_at` (`archivedAt`) | timestamp with time zone • nullable |

### `proposals`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `title` | text • not null |
| `person_id` (`personId`) | text • nullable |
| `organization_id` (`organizationId`) | text • nullable |
| `pipeline_id` (`pipelineId`) | text • FK -> pipelines.id • not null |
| `stage_id` (`stageId`) | text • FK -> stages.id • not null |
| `owner_id` (`ownerId`) | text • nullable |
| `status` | proposal_status • not null • default "open" |
| `accepted_version_id` (`acceptedVersionId`) | text • nullable |
| `value_amount_cents` (`valueAmountCents`) | integer • nullable |
| `value_currency` (`valueCurrency`) | text • nullable |
| `pax_count` (`paxCount`) | integer • nullable |
| `expected_close_date` (`expectedCloseDate`) | date • nullable |
| `source` | text • nullable |
| `source_ref` (`sourceRef`) | text • nullable |
| `lost_reason` (`lostReason`) | text • nullable |
| `tags` | jsonb • not null • default [] |
| `custom_fields` (`customFields`) | jsonb • not null • default |
| `description` | text • nullable |
| `created_by` (`createdBy`) | text • nullable |
| `updated_by` (`updatedBy`) | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |
| `stage_changed_at` (`stageChangedAt`) | timestamp with time zone • not null • default |
| `closed_at` (`closedAt`) | timestamp with time zone • nullable |

### `stages`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `pipeline_id` (`pipelineId`) | text • FK -> pipelines.id • not null |
| `name` | text • not null |
| `sort_order` (`sortOrder`) | integer • not null • default 0 |
| `probability` | integer • nullable |
| `is_closed` (`isClosed`) | boolean • not null • default false |
| `is_won` (`isWon`) | boolean • not null • default false |
| `is_lost` (`isLost`) | boolean • not null • default false |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

## Identity

### `identity_addresses`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `entity_type` (`entityType`) | text • not null |
| `entity_id` (`entityId`) | text • not null |
| `label` | address_label • not null • default "other" |
| `full_text` (`fullText`) | text • nullable |
| `line_1` (`line1`) | text • nullable |
| `line_2` (`line2`) | text • nullable |
| `city` | text • nullable |
| `region` | text • nullable |
| `postal_code` (`postalCode`) | text • nullable |
| `country` | text • nullable |
| `latitude` | double precision • nullable |
| `longitude` | double precision • nullable |
| `timezone` | text • nullable |
| `is_primary` (`isPrimary`) | boolean • not null • default false |
| `notes` | text • nullable |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `identity_contact_points`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `entity_type` (`entityType`) | text • not null |
| `entity_id` (`entityId`) | text • not null |
| `kind` | contact_point_kind • not null |
| `label` | text • nullable |
| `value` | text • not null |
| `normalized_value` (`normalizedValue`) | text • nullable |
| `is_primary` (`isPrimary`) | boolean • not null • default false |
| `notes` | text • nullable |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `identity_named_contacts`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `entity_type` (`entityType`) | text • not null |
| `entity_id` (`entityId`) | text • not null |
| `role` | named_contact_role • not null • default "general" |
| `name` | text • not null |
| `title` | text • nullable |
| `email` | text • nullable |
| `phone` | text • nullable |
| `is_primary` (`isPrimary`) | boolean • not null • default false |
| `notes` | text • nullable |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

## Inventory

### `booking_item_product_details`
| Column | Type |
|--------|------|
| `booking_item_id` (`bookingItemId`) | text • PK • not null |
| `product_id` (`productId`) | text • nullable |
| `option_id` (`optionId`) | text • nullable |
| `unit_id` (`unitId`) | text • nullable |
| `supplier_service_id` (`supplierServiceId`) | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `booking_product_details`
| Column | Type |
|--------|------|
| `booking_id` (`bookingId`) | text • PK • not null |
| `product_id` (`productId`) | text • nullable |
| `option_id` (`optionId`) | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `destination_translations`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `destination_id` (`destinationId`) | text • FK -> destinations.id • not null |
| `language_tag` (`languageTag`) | text • not null |
| `name` | text • not null |
| `description` | text • nullable |
| `seo_title` (`seoTitle`) | text • nullable |
| `seo_description` (`seoDescription`) | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `destinations`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `parent_id` (`parentId`) | text • nullable |
| `slug` | text • not null |
| `code` | text • nullable |
| `canonical_place_id` (`canonicalPlaceId`) | text • nullable |
| `destination_type` (`destinationType`) | text • not null • default "destination" |
| `latitude` | double precision • nullable |
| `longitude` | double precision • nullable |
| `sort_order` (`sortOrder`) | integer • not null • default 0 |
| `active` | boolean • not null • default true |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `extras_sourced_content`
| Column | Type |
|--------|------|
| `entity_id` | text • PK • not null |
| `locale` | text • PK • not null |
| `market` | text • PK • not null • default "*" |
| `payload` | jsonb • not null |
| `content_schema_version` | text • not null |
| `returned_locale` | text • not null |
| `machine_translated` | boolean • not null • default false |
| `source_updated_at` | timestamp with time zone • nullable |
| `fetched_at` | timestamp with time zone • not null • default |
| `fresh_until` | timestamp with time zone • nullable |
| `etag` | text • nullable |
| `fetch_status` | text • not null • default "ok" |
| `fetch_error` | text • nullable |

Constraints:
- Primary key: `entity_id`, `locale`, `market`

### `option_extra_configs`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `option_id` (`optionId`) | text • not null |
| `product_extra_id` (`productExtraId`) | text • FK -> product_extras.id • not null |
| `selection_type` (`selectionType`) | extra_selection_type • nullable |
| `pricing_mode` (`pricingMode`) | extra_pricing_mode • nullable |
| `priced_per_person` (`pricedPerPerson`) | boolean • nullable |
| `min_quantity` (`minQuantity`) | integer • nullable |
| `max_quantity` (`maxQuantity`) | integer • nullable |
| `default_quantity` (`defaultQuantity`) | integer • nullable |
| `is_default` (`isDefault`) | boolean • not null • default false |
| `active` | boolean • not null • default true |
| `sort_order` (`sortOrder`) | integer • not null • default 0 |
| `notes` | text • nullable |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `option_unit_translations`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `unit_id` (`unitId`) | text • FK -> option_units.id • not null |
| `language_tag` (`languageTag`) | text • not null |
| `name` | text • not null |
| `short_description` (`shortDescription`) | text • nullable |
| `description` | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `option_units`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `option_id` (`optionId`) | text • FK -> product_options.id • not null |
| `name` | text • not null |
| `code` | text • nullable |
| `description` | text • nullable |
| `unit_type` (`unitType`) | option_unit_type • not null • default "person" |
| `min_quantity` (`minQuantity`) | integer • nullable |
| `max_quantity` (`maxQuantity`) | integer • nullable |
| `min_age` (`minAge`) | integer • nullable |
| `max_age` (`maxAge`) | integer • nullable |
| `occupancy_min` (`occupancyMin`) | integer • nullable |
| `occupancy_max` (`occupancyMax`) | integer • nullable |
| `is_required` (`isRequired`) | boolean • not null • default false |
| `is_hidden` (`isHidden`) | boolean • not null • default false |
| `sort_order` (`sortOrder`) | integer • not null • default 0 |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `product_activation_settings`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `product_id` (`productId`) | text • FK -> products.id • not null |
| `activation_mode` (`activationMode`) | product_activation_mode • not null • default "manual" |
| `activate_at` (`activateAt`) | timestamp with time zone • nullable |
| `deactivate_at` (`deactivateAt`) | timestamp with time zone • nullable |
| `sell_at` (`sellAt`) | timestamp with time zone • nullable |
| `stop_sell_at` (`stopSellAt`) | timestamp with time zone • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `product_authoring_requests`
| Column | Type |
|--------|------|
| `idempotency_key` (`idempotencyKey`) | text • PK • not null |
| `product_id` (`productId`) | text • not null |
| `operation` | text • not null |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |

### `product_capabilities`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `product_id` (`productId`) | text • FK -> products.id • not null |
| `capability` | product_capability • not null |
| `enabled` | boolean • not null • default true |
| `notes` | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `product_categories`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `parent_id` (`parentId`) | text • nullable |
| `name` | text • not null |
| `slug` | text • not null |
| `description` | text • nullable |
| `sort_order` (`sortOrder`) | integer • not null • default 0 |
| `active` | boolean • not null • default true |
| `customer_payment_policy` (`customerPaymentPolicy`) | jsonb • nullable |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `product_category_products`
| Column | Type |
|--------|------|
| `product_id` (`productId`) | text • PK • FK -> products.id • not null |
| `category_id` (`categoryId`) | text • PK • FK -> product_categories.id • not null |
| `sort_order` (`sortOrder`) | integer • not null • default 0 |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

Constraints:
- Primary key: `product_id`, `category_id`

### `product_category_translations`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `category_id` (`categoryId`) | text • FK -> product_categories.id • not null |
| `language_tag` (`languageTag`) | text • not null |
| `name` | text • not null |
| `description` | text • nullable |
| `seo_title` (`seoTitle`) | text • nullable |
| `seo_description` (`seoDescription`) | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `product_day_service_translations`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `service_id` (`serviceId`) | text • FK -> product_day_services.id • not null |
| `language_tag` (`languageTag`) | text • not null |
| `name` | text • not null |
| `description` | text • nullable |
| `notes` | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `product_day_services`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `day_id` (`dayId`) | text • FK -> product_days.id • not null |
| `supplier_service_id` (`supplierServiceId`) | text • nullable |
| `service_type` (`serviceType`) | service_type • not null |
| `name` | text • not null |
| `description` | text • nullable |
| `country_code` (`countryCode`) | text • nullable |
| `cost_currency` (`costCurrency`) | text • not null |
| `cost_amount_cents` (`costAmountCents`) | integer • not null |
| `quantity` | integer • not null • default 1 |
| `sort_order` (`sortOrder`) | integer • nullable |
| `notes` | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |

### `product_day_translations`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `day_id` (`dayId`) | text • FK -> product_days.id • not null |
| `language_tag` (`languageTag`) | text • not null |
| `title` | text • nullable |
| `description` | text • nullable |
| `location` | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `product_days`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `itinerary_id` (`itineraryId`) | text • FK -> product_itineraries.id • not null |
| `day_number` (`dayNumber`) | integer • not null |
| `title` | text • nullable |
| `description` | text • nullable |
| `location` | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `product_delivery_formats`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `product_id` (`productId`) | text • FK -> products.id • not null |
| `format` | product_delivery_format • not null |
| `is_default` (`isDefault`) | boolean • not null • default false |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `product_destinations`
| Column | Type |
|--------|------|
| `product_id` (`productId`) | text • PK • FK -> products.id • not null |
| `destination_id` (`destinationId`) | text • PK • FK -> destinations.id • not null |
| `sort_order` (`sortOrder`) | integer • not null • default 0 |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

Constraints:
- Primary key: `product_id`, `destination_id`

### `product_extras`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `product_id` (`productId`) | text • not null |
| `supplier_id` (`supplierId`) | text • nullable |
| `code` | text • nullable |
| `name` | text • not null |
| `description` | text • nullable |
| `selection_type` (`selectionType`) | extra_selection_type • not null • default "optional" |
| `pricing_mode` (`pricingMode`) | extra_pricing_mode • not null • default "per_booking" |
| `priced_per_person` (`pricedPerPerson`) | boolean • not null • default false |
| `collection_mode` (`collectionMode`) | extra_collection_mode • not null • default "booking_total" |
| `show_on_slot_manifest` (`showOnSlotManifest`) | boolean • not null • default true |
| `min_quantity` (`minQuantity`) | integer • nullable |
| `max_quantity` (`maxQuantity`) | integer • nullable |
| `default_quantity` (`defaultQuantity`) | integer • nullable |
| `active` | boolean • not null • default true |
| `sort_order` (`sortOrder`) | integer • not null • default 0 |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `product_faqs`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `product_id` (`productId`) | text • FK -> products.id • not null |
| `question` | text • not null |
| `answer` | text • not null |
| `sort_order` (`sortOrder`) | integer • not null • default 0 |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `product_features`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `product_id` (`productId`) | text • FK -> products.id • not null |
| `feature_type` (`featureType`) | product_feature_type • not null • default "highlight" |
| `title` | text • not null |
| `description` | text • nullable |
| `sort_order` (`sortOrder`) | integer • not null • default 0 |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `product_itineraries`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `product_id` (`productId`) | text • FK -> products.id • not null |
| `name` | text • not null |
| `is_default` (`isDefault`) | boolean • not null • default false |
| `sort_order` (`sortOrder`) | integer • not null • default 0 |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `product_itinerary_translations`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `itinerary_id` (`itineraryId`) | text • FK -> product_itineraries.id • not null |
| `language_tag` (`languageTag`) | text • not null |
| `name` | text • not null |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `product_locations`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `product_id` (`productId`) | text • FK -> products.id • not null |
| `location_type` (`locationType`) | product_location_type • not null • default "point_of_interest" |
| `title` | text • not null |
| `address` | text • nullable |
| `city` | text • nullable |
| `country_code` (`countryCode`) | text • nullable |
| `latitude` | double precision • nullable |
| `longitude` | double precision • nullable |
| `google_place_id` (`googlePlaceId`) | text • nullable |
| `apple_place_id` (`applePlaceId`) | text • nullable |
| `tripadvisor_location_id` (`tripadvisorLocationId`) | text • nullable |
| `sort_order` (`sortOrder`) | integer • not null • default 0 |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `product_media`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `product_id` (`productId`) | text • FK -> products.id • not null |
| `day_id` (`dayId`) | text • FK -> product_days.id • nullable |
| `media_type` (`mediaType`) | product_media_type • not null |
| `name` | text • not null |
| `url` | text • not null |
| `storage_key` (`storageKey`) | text • nullable |
| `mime_type` (`mimeType`) | text • nullable |
| `file_size` (`fileSize`) | integer • nullable |
| `width` | integer • nullable |
| `height` | integer • nullable |
| `alt_text` (`altText`) | text • nullable |
| `asset_id` (`assetId`) | text • nullable |
| `sort_order` (`sortOrder`) | integer • not null • default 0 |
| `is_cover` (`isCover`) | boolean • not null • default false |
| `is_open_graph` (`isOpenGraph`) | boolean • not null • default false |
| `is_brochure` (`isBrochure`) | boolean • not null • default false |
| `is_brochure_current` (`isBrochureCurrent`) | boolean • not null • default false |
| `brochure_version` (`brochureVersion`) | integer • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `product_notes`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `product_id` (`productId`) | text • FK -> products.id • not null |
| `author_id` (`authorId`) | text • not null |
| `content` | text • not null |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |

### `product_option_translations`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `option_id` (`optionId`) | text • FK -> product_options.id • not null |
| `language_tag` (`languageTag`) | text • not null |
| `name` | text • not null |
| `short_description` (`shortDescription`) | text • nullable |
| `description` | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `product_options`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `product_id` (`productId`) | text • FK -> products.id • not null |
| `name` | text • not null |
| `code` | text • nullable |
| `description` | text • nullable |
| `status` | product_option_status • not null • default "draft" |
| `is_default` (`isDefault`) | boolean • not null • default false |
| `sort_order` (`sortOrder`) | integer • not null • default 0 |
| `available_from` (`availableFrom`) | date • nullable |
| `available_to` (`availableTo`) | date • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `product_pax_pricing_tiers`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `product_id` (`productId`) | text • FK -> products.id • not null |
| `option_unit_id` (`optionUnitId`) | text • FK -> option_units.id • nullable |
| `tier_pax` (`tierPax`) | integer • not null |
| `price_per_pax_cents` (`pricePerPaxCents`) | integer • not null |
| `promo_price_per_pax_cents` (`promoPricePerPaxCents`) | integer • nullable |
| `effective_from` (`effectiveFrom`) | date • nullable |
| `effective_to` (`effectiveTo`) | date • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `product_tag_products`
| Column | Type |
|--------|------|
| `product_id` (`productId`) | text • PK • FK -> products.id • not null |
| `tag_id` (`tagId`) | text • PK • FK -> product_tags.id • not null |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |

Constraints:
- Primary key: `product_id`, `tag_id`

### `product_tag_translations`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `tag_id` (`tagId`) | text • FK -> product_tags.id • not null |
| `language_tag` (`languageTag`) | text • not null |
| `name` | text • not null |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `product_tags`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `name` | text • not null |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `product_ticket_settings`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `product_id` (`productId`) | text • FK -> products.id • not null |
| `fulfillment_mode` (`fulfillmentMode`) | product_ticket_fulfillment • not null • default "none" |
| `default_delivery_format` (`defaultDeliveryFormat`) | product_delivery_format • not null • default "none" |
| `ticket_per_unit` (`ticketPerUnit`) | boolean • not null • default false |
| `barcode_format` (`barcodeFormat`) | text • nullable |
| `service_voucher_message` (`serviceVoucherMessage`) | text • nullable |
| `ticket_message` (`ticketMessage`) | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `product_translations`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `product_id` (`productId`) | text • FK -> products.id • not null |
| `language_tag` (`languageTag`) | text • not null |
| `slug` | text • nullable |
| `name` | text • not null |
| `short_description` (`shortDescription`) | text • nullable |
| `description` | text • nullable |
| `inclusions_html` (`inclusionsHtml`) | text • nullable |
| `exclusions_html` (`exclusionsHtml`) | text • nullable |
| `terms_html` (`termsHtml`) | text • nullable |
| `seo_title` (`seoTitle`) | text • nullable |
| `seo_description` (`seoDescription`) | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `product_types`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `name` | text • not null |
| `code` | text • not null |
| `description` | text • nullable |
| `sort_order` (`sortOrder`) | integer • not null • default 0 |
| `active` | boolean • not null • default true |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `product_versions`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `product_id` (`productId`) | text • FK -> products.id • not null |
| `version_number` (`versionNumber`) | integer • not null |
| `snapshot` | jsonb • not null |
| `author_id` (`authorId`) | text • not null |
| `notes` | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |

### `product_visibility_settings`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `product_id` (`productId`) | text • FK -> products.id • not null |
| `is_searchable` (`isSearchable`) | boolean • not null • default false |
| `is_bookable` (`isBookable`) | boolean • not null • default false |
| `is_featured` (`isFeatured`) | boolean • not null • default false |
| `requires_authentication` (`requiresAuthentication`) | boolean • not null • default false |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `products`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `name` | text • not null |
| `status` | product_status • not null • default "draft" |
| `description` | text • nullable |
| `inclusions_html` (`inclusionsHtml`) | text • nullable |
| `exclusions_html` (`exclusionsHtml`) | text • nullable |
| `terms_html` (`termsHtml`) | text • nullable |
| `terms_show_on_contract` (`termsShowOnContract`) | boolean • not null • default false |
| `booking_mode` (`bookingMode`) | product_booking_mode • not null • default "date" |
| `capacity_mode` (`capacityMode`) | product_capacity_mode • not null • default "limited" |
| `timezone` | text • nullable |
| `default_language_tag` (`defaultLanguageTag`) | text • nullable |
| `visibility` | product_visibility • not null • default "private" |
| `activated` | boolean • not null • default false |
| `reservation_timeout_minutes` (`reservationTimeoutMinutes`) | integer • nullable |
| `sell_currency` (`sellCurrency`) | text • not null |
| `sell_amount_cents` (`sellAmountCents`) | integer • nullable |
| `cost_amount_cents` (`costAmountCents`) | integer • nullable |
| `margin_percent` (`marginPercent`) | integer • nullable |
| `facility_id` (`facilityId`) | text • nullable |
| `supplier_id` (`supplierId`) | text • nullable |
| `start_date` (`startDate`) | date • nullable |
| `end_date` (`endDate`) | date • nullable |
| `pax` | integer • nullable |
| `product_type_id` (`productTypeId`) | text • nullable |
| `contract_template_id` (`contractTemplateId`) | text • nullable |
| `tax_class_id` (`taxClassId`) | text • nullable |
| `customer_payment_policy` (`customerPaymentPolicy`) | jsonb • nullable |
| `tags` | jsonb • nullable • default [] |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `products_sourced_content`
| Column | Type |
|--------|------|
| `entity_id` | text • PK • not null |
| `locale` | text • PK • not null |
| `market` | text • PK • not null • default "*" |
| `payload` | jsonb • not null |
| `content_schema_version` | text • not null |
| `returned_locale` | text • not null |
| `machine_translated` | boolean • not null • default false |
| `source_updated_at` | timestamp with time zone • nullable |
| `fetched_at` | timestamp with time zone • not null • default |
| `fresh_until` | timestamp with time zone • nullable |
| `etag` | text • nullable |
| `fetch_status` | text • not null • default "ok" |
| `fetch_error` | text • nullable |

Constraints:
- Primary key: `entity_id`, `locale`, `market`

## Commerce

### `cancellation_policies`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `code` | text • nullable |
| `name` | text • not null |
| `policy_type` (`policyType`) | cancellation_policy_type • not null • default "custom" |
| `simple_cutoff_hours` (`simpleCutoffHours`) | integer • nullable |
| `is_default` (`isDefault`) | boolean • not null • default false |
| `active` | boolean • not null • default true |
| `notes` | text • nullable |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `cancellation_policy_rules`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `cancellation_policy_id` (`cancellationPolicyId`) | text • FK -> cancellation_policies.id • not null |
| `sort_order` (`sortOrder`) | integer • not null • default 0 |
| `cutoff_minutes_before` (`cutoffMinutesBefore`) | integer • nullable |
| `charge_type` (`chargeType`) | cancellation_charge_type • not null • default "none" |
| `charge_amount_cents` (`chargeAmountCents`) | integer • nullable |
| `charge_percent_basis_points` (`chargePercentBasisPoints`) | integer • nullable |
| `active` | boolean • not null • default true |
| `notes` | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `departure_price_overrides`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `departure_id` (`departureId`) | text • not null |
| `option_id` (`optionId`) | text • not null |
| `option_unit_id` (`optionUnitId`) | text • not null |
| `price_catalog_id` (`priceCatalogId`) | text • FK -> price_catalogs.id • not null |
| `sell_amount_cents` (`sellAmountCents`) | integer • not null |
| `cost_amount_cents` (`costAmountCents`) | integer • nullable |
| `notes` | text • nullable |
| `active` | boolean • not null • default true |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `dropoff_price_rules`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `option_price_rule_id` (`optionPriceRuleId`) | text • FK -> option_price_rules.id • not null |
| `option_id` (`optionId`) | text • not null |
| `facility_id` (`facilityId`) | text • nullable |
| `dropoff_code` (`dropoffCode`) | text • nullable |
| `dropoff_name` (`dropoffName`) | text • not null |
| `pricing_mode` (`pricingMode`) | addon_pricing_mode • not null • default "included" |
| `sell_amount_cents` (`sellAmountCents`) | integer • nullable |
| `cost_amount_cents` (`costAmountCents`) | integer • nullable |
| `active` | boolean • not null • default true |
| `sort_order` (`sortOrder`) | integer • not null • default 0 |
| `notes` | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `exchange_rates`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `fx_rate_set_id` (`fxRateSetId`) | text • FK -> fx_rate_sets.id • not null |
| `base_currency` (`baseCurrency`) | text • not null |
| `quote_currency` (`quoteCurrency`) | text • not null |
| `rate_decimal` (`rateDecimal`) | numeric(18, 8) • not null |
| `inverse_rate_decimal` (`inverseRateDecimal`) | numeric(18, 8) • nullable |
| `observed_at` (`observedAt`) | timestamp with time zone • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |

### `extra_price_rules`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `option_price_rule_id` (`optionPriceRuleId`) | text • FK -> option_price_rules.id • not null |
| `option_id` (`optionId`) | text • not null |
| `product_extra_id` (`productExtraId`) | text • nullable |
| `option_extra_config_id` (`optionExtraConfigId`) | text • nullable |
| `pricing_mode` (`pricingMode`) | addon_pricing_mode • not null • default "included" |
| `sell_amount_cents` (`sellAmountCents`) | integer • nullable |
| `cost_amount_cents` (`costAmountCents`) | integer • nullable |
| `active` | boolean • not null • default true |
| `sort_order` (`sortOrder`) | integer • not null • default 0 |
| `notes` | text • nullable |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `fx_rate_sets`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `source` | fx_rate_source • not null • default "manual" |
| `base_currency` (`baseCurrency`) | text • not null |
| `effective_at` (`effectiveAt`) | timestamp with time zone • not null |
| `observed_at` (`observedAt`) | timestamp with time zone • nullable |
| `source_reference` (`sourceReference`) | text • nullable |
| `notes` | text • nullable |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |

### `market_channel_rules`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `market_id` (`marketId`) | text • FK -> markets.id • not null |
| `channel_id` (`channelId`) | text • not null |
| `price_catalog_id` (`priceCatalogId`) | text • FK -> market_price_catalogs.id • nullable |
| `visibility` | market_visibility • not null • default "public" |
| `sellability` | market_sellability • not null • default "sellable" |
| `active` | boolean • not null • default true |
| `priority` | integer • not null • default 0 |
| `notes` | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `market_currencies`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `market_id` (`marketId`) | text • FK -> markets.id • not null |
| `currency_code` (`currencyCode`) | text • not null |
| `is_default` (`isDefault`) | boolean • not null • default false |
| `is_settlement` (`isSettlement`) | boolean • not null • default false |
| `is_reporting` (`isReporting`) | boolean • not null • default false |
| `sort_order` (`sortOrder`) | integer • not null • default 0 |
| `active` | boolean • not null • default true |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `market_locales`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `market_id` (`marketId`) | text • FK -> markets.id • not null |
| `language_tag` (`languageTag`) | text • not null |
| `is_default` (`isDefault`) | boolean • not null • default false |
| `sort_order` (`sortOrder`) | integer • not null • default 0 |
| `active` | boolean • not null • default true |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `market_price_catalogs`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `market_id` (`marketId`) | text • FK -> markets.id • not null |
| `price_catalog_id` (`priceCatalogId`) | text • not null |
| `is_default` (`isDefault`) | boolean • not null • default false |
| `priority` | integer • not null • default 0 |
| `active` | boolean • not null • default true |
| `notes` | text • nullable |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `market_product_rules`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `market_id` (`marketId`) | text • FK -> markets.id • not null |
| `product_id` (`productId`) | text • not null |
| `option_id` (`optionId`) | text • nullable |
| `price_catalog_id` (`priceCatalogId`) | text • FK -> market_price_catalogs.id • nullable |
| `visibility` | market_visibility • not null • default "public" |
| `sellability` | market_sellability • not null • default "sellable" |
| `channel_scope` (`channelScope`) | market_channel_scope • not null • default "all" |
| `active` | boolean • not null • default true |
| `available_from` (`availableFrom`) | date • nullable |
| `available_to` (`availableTo`) | date • nullable |
| `notes` | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `markets`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `code` | text • not null |
| `name` | text • not null |
| `status` | market_status • not null • default "active" |
| `region_code` (`regionCode`) | text • nullable |
| `country_code` (`countryCode`) | text • nullable |
| `default_language_tag` (`defaultLanguageTag`) | text • not null |
| `default_currency` (`defaultCurrency`) | text • not null |
| `timezone` | text • nullable |
| `tax_context` (`taxContext`) | text • nullable |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `offer_expiration_events`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `offer_id` (`offerId`) | text • not null |
| `snapshot_id` (`snapshotId`) | text • FK -> sellability_snapshots.id • nullable |
| `expires_at` (`expiresAt`) | timestamp with time zone • not null |
| `expired_at` (`expiredAt`) | timestamp with time zone • nullable |
| `status` | offer_expiration_event_status • not null • default "scheduled" |
| `reason` | text • nullable |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `offer_refresh_runs`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `offer_id` (`offerId`) | text • not null |
| `snapshot_id` (`snapshotId`) | text • FK -> sellability_snapshots.id • nullable |
| `status` | offer_refresh_run_status • not null • default "pending" |
| `started_at` (`startedAt`) | timestamp with time zone • not null • default |
| `completed_at` (`completedAt`) | timestamp with time zone • nullable |
| `notes` | text • nullable |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `option_price_rules`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `product_id` (`productId`) | text • not null |
| `option_id` (`optionId`) | text • not null |
| `price_catalog_id` (`priceCatalogId`) | text • FK -> price_catalogs.id • not null |
| `price_schedule_id` (`priceScheduleId`) | text • FK -> price_schedules.id • nullable |
| `cancellation_policy_id` (`cancellationPolicyId`) | text • FK -> cancellation_policies.id • nullable |
| `code` | text • nullable |
| `name` | text • not null |
| `description` | text • nullable |
| `pricing_mode` (`pricingMode`) | option_pricing_mode • not null • default "per_person" |
| `base_sell_amount_cents` (`baseSellAmountCents`) | integer • nullable |
| `base_cost_amount_cents` (`baseCostAmountCents`) | integer • nullable |
| `min_per_booking` (`minPerBooking`) | integer • nullable |
| `max_per_booking` (`maxPerBooking`) | integer • nullable |
| `all_pricing_categories` (`allPricingCategories`) | boolean • not null • default true |
| `is_default` (`isDefault`) | boolean • not null • default false |
| `active` | boolean • not null • default true |
| `notes` | text • nullable |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `option_start_time_rules`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `option_price_rule_id` (`optionPriceRuleId`) | text • FK -> option_price_rules.id • not null |
| `option_id` (`optionId`) | text • not null |
| `start_time_id` (`startTimeId`) | text • not null |
| `rule_mode` (`ruleMode`) | option_start_time_rule_mode • not null • default "included" |
| `adjustment_type` (`adjustmentType`) | price_adjustment_type • nullable |
| `sell_adjustment_cents` (`sellAdjustmentCents`) | integer • nullable |
| `cost_adjustment_cents` (`costAdjustmentCents`) | integer • nullable |
| `adjustment_basis_points` (`adjustmentBasisPoints`) | integer • nullable |
| `active` | boolean • not null • default true |
| `notes` | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `option_unit_price_rules`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `option_price_rule_id` (`optionPriceRuleId`) | text • FK -> option_price_rules.id • not null |
| `option_id` (`optionId`) | text • not null |
| `unit_id` (`unitId`) | text • not null |
| `pricing_category_id` (`pricingCategoryId`) | text • FK -> pricing_categories.id • nullable |
| `pricing_mode` (`pricingMode`) | option_unit_pricing_mode • not null • default "per_unit" |
| `sell_amount_cents` (`sellAmountCents`) | integer • nullable |
| `cost_amount_cents` (`costAmountCents`) | integer • nullable |
| `min_quantity` (`minQuantity`) | integer • nullable |
| `max_quantity` (`maxQuantity`) | integer • nullable |
| `active` | boolean • not null • default true |
| `sort_order` (`sortOrder`) | integer • not null • default 0 |
| `notes` | text • nullable |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `option_unit_tiers`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `option_unit_price_rule_id` (`optionUnitPriceRuleId`) | text • FK -> option_unit_price_rules.id • not null |
| `min_quantity` (`minQuantity`) | integer • not null |
| `max_quantity` (`maxQuantity`) | integer • nullable |
| `sell_amount_cents` (`sellAmountCents`) | integer • nullable |
| `cost_amount_cents` (`costAmountCents`) | integer • nullable |
| `active` | boolean • not null • default true |
| `sort_order` (`sortOrder`) | integer • not null • default 0 |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `pickup_price_rules`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `option_price_rule_id` (`optionPriceRuleId`) | text • FK -> option_price_rules.id • not null |
| `option_id` (`optionId`) | text • not null |
| `pickup_point_id` (`pickupPointId`) | text • not null |
| `pricing_mode` (`pricingMode`) | addon_pricing_mode • not null • default "included" |
| `sell_amount_cents` (`sellAmountCents`) | integer • nullable |
| `cost_amount_cents` (`costAmountCents`) | integer • nullable |
| `active` | boolean • not null • default true |
| `sort_order` (`sortOrder`) | integer • not null • default 0 |
| `notes` | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `price_catalogs`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `code` | text • not null |
| `name` | text • not null |
| `currency_code` (`currencyCode`) | text • nullable |
| `catalog_type` (`catalogType`) | price_catalog_type • not null • default "public" |
| `is_default` (`isDefault`) | boolean • not null • default false |
| `active` | boolean • not null • default true |
| `notes` | text • nullable |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `price_schedules`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `price_catalog_id` (`priceCatalogId`) | text • FK -> price_catalogs.id • not null |
| `code` | text • nullable |
| `name` | text • not null |
| `recurrence_rule` (`recurrenceRule`) | text • not null |
| `timezone` | text • nullable |
| `valid_from` (`validFrom`) | date • nullable |
| `valid_to` (`validTo`) | date • nullable |
| `weekdays` | jsonb • nullable |
| `priority` | integer • not null • default 0 |
| `active` | boolean • not null • default true |
| `notes` | text • nullable |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `pricing_categories`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `product_id` (`productId`) | text • nullable |
| `option_id` (`optionId`) | text • nullable |
| `unit_id` (`unitId`) | text • nullable |
| `code` | text • nullable |
| `name` | text • not null |
| `category_type` (`categoryType`) | pricing_category_type • not null • default "other" |
| `seat_occupancy` (`seatOccupancy`) | integer • not null • default 1 |
| `group_size` (`groupSize`) | integer • nullable |
| `is_age_qualified` (`isAgeQualified`) | boolean • not null • default false |
| `min_age` (`minAge`) | integer • nullable |
| `max_age` (`maxAge`) | integer • nullable |
| `internal_use_only` (`internalUseOnly`) | boolean • not null • default false |
| `active` | boolean • not null • default true |
| `sort_order` (`sortOrder`) | integer • not null • default 0 |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `pricing_category_dependencies`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `pricing_category_id` (`pricingCategoryId`) | text • FK -> pricing_categories.id • not null |
| `master_pricing_category_id` (`masterPricingCategoryId`) | text • FK -> pricing_categories.id • not null |
| `dependency_type` (`dependencyType`) | pricing_dependency_type • not null • default "requires" |
| `max_per_master` (`maxPerMaster`) | integer • nullable |
| `max_dependent_sum` (`maxDependentSum`) | integer • nullable |
| `active` | boolean • not null • default true |
| `notes` | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `promotion_reindex_state`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default "all-products" |
| `requested_generation` (`requestedGeneration`) | integer • not null • default 0 |
| `completed_generation` (`completedGeneration`) | integer • not null • default 0 |
| `claimed_generation` (`claimedGeneration`) | integer • nullable |
| `lease_owner` (`leaseOwner`) | text • nullable |
| `lease_until` (`leaseUntil`) | timestamp with time zone • nullable |
| `requested_at` (`requestedAt`) | timestamp with time zone • not null • default |
| `completed_at` (`completedAt`) | timestamp with time zone • nullable |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `promotional_offer_products`
| Column | Type |
|--------|------|
| `offer_id` (`offerId`) | text • PK • FK -> promotional_offers.id • not null |
| `product_id` (`productId`) | text • PK • not null |

Constraints:
- Primary key: `offer_id`, `product_id`

### `promotional_offer_redemptions`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `offer_id` (`offerId`) | text • FK -> promotional_offers.id • not null |
| `booking_id` (`bookingId`) | text • not null |
| `code_used` (`codeUsed`) | text • nullable |
| `discount_applied_cents` (`discountAppliedCents`) | integer • not null |
| `currency` | text • not null |
| `redeemed_at` (`redeemedAt`) | timestamp with time zone • not null • default |

### `promotional_offer_scheduler_state`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `singleton_key` (`singletonKey`) | text • not null • default "singleton" |
| `last_tick` (`lastTick`) | timestamp with time zone • not null |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `promotional_offers`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `name` | text • not null |
| `slug` | text • not null |
| `description` | text • nullable |
| `discount_type` (`discountType`) | promotional_offer_discount_type • not null |
| `discount_percent` (`discountPercent`) | numeric(5, 2) • nullable |
| `discount_amount_cents` (`discountAmountCents`) | integer • nullable |
| `currency` | text • nullable |
| `scope` | jsonb • not null |
| `conditions` | jsonb • not null • default |
| `valid_from` (`validFrom`) | timestamp with time zone • nullable |
| `valid_until` (`validUntil`) | timestamp with time zone • nullable |
| `code` | text • nullable |
| `stackable` | boolean • not null • default false |
| `active` | boolean • not null • default true |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `sellability_explanations`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `snapshot_id` (`snapshotId`) | text • FK -> sellability_snapshots.id • not null |
| `snapshot_item_id` (`snapshotItemId`) | text • FK -> sellability_snapshot_items.id • nullable |
| `candidate_index` (`candidateIndex`) | integer • not null • default 0 |
| `explanation_type` (`explanationType`) | sellability_explanation_type • not null • default "policy" |
| `code` | text • nullable |
| `message` | text • not null |
| `details` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |

### `sellability_policies`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `name` | text • not null |
| `scope` | sellability_policy_scope • not null • default "global" |
| `policy_type` (`policyType`) | sellability_policy_type • not null • default "custom" |
| `product_id` (`productId`) | text • nullable |
| `option_id` (`optionId`) | text • nullable |
| `market_id` (`marketId`) | text • nullable |
| `channel_id` (`channelId`) | text • nullable |
| `priority` | integer • not null • default 0 |
| `active` | boolean • not null • default true |
| `conditions` | jsonb • not null • default |
| `effects` | jsonb • not null • default |
| `notes` | text • nullable |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `sellability_policy_results`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `snapshot_id` (`snapshotId`) | text • FK -> sellability_snapshots.id • not null |
| `snapshot_item_id` (`snapshotItemId`) | text • FK -> sellability_snapshot_items.id • nullable |
| `policy_id` (`policyId`) | text • FK -> sellability_policies.id • nullable |
| `candidate_index` (`candidateIndex`) | integer • not null • default 0 |
| `status` | sellability_policy_result_status • not null • default "passed" |
| `message` | text • nullable |
| `details` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |

### `sellability_snapshot_items`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `snapshot_id` (`snapshotId`) | text • FK -> sellability_snapshots.id • not null |
| `candidate_index` (`candidateIndex`) | integer • not null • default 0 |
| `component_index` (`componentIndex`) | integer • not null • default 0 |
| `product_id` (`productId`) | text • nullable |
| `option_id` (`optionId`) | text • nullable |
| `slot_id` (`slotId`) | text • nullable |
| `unit_id` (`unitId`) | text • nullable |
| `request_ref` (`requestRef`) | text • nullable |
| `component_kind` (`componentKind`) | sellability_snapshot_component_kind • not null |
| `title` | text • not null |
| `quantity` | integer • not null • default 1 |
| `pricing_mode` (`pricingMode`) | text • not null |
| `pricing_category_id` (`pricingCategoryId`) | text • nullable |
| `pricing_category_name` (`pricingCategoryName`) | text • nullable |
| `unit_name` (`unitName`) | text • nullable |
| `unit_type` (`unitType`) | text • nullable |
| `currency_code` (`currencyCode`) | text • not null |
| `sell_amount_cents` (`sellAmountCents`) | integer • not null • default 0 |
| `cost_amount_cents` (`costAmountCents`) | integer • not null • default 0 |
| `source_rule_id` (`sourceRuleId`) | text • nullable |
| `tier_id` (`tierId`) | text • nullable |
| `is_selected` (`isSelected`) | boolean • not null • default true |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |

### `sellability_snapshots`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `offer_id` (`offerId`) | text • nullable |
| `market_id` (`marketId`) | text • nullable |
| `channel_id` (`channelId`) | text • nullable |
| `product_id` (`productId`) | text • nullable |
| `option_id` (`optionId`) | text • nullable |
| `slot_id` (`slotId`) | text • nullable |
| `requested_currency_code` (`requestedCurrencyCode`) | text • nullable |
| `source_currency_code` (`sourceCurrencyCode`) | text • nullable |
| `fx_rate_set_id` (`fxRateSetId`) | text • nullable |
| `status` | sellability_snapshot_status • not null • default "resolved" |
| `query_payload` (`queryPayload`) | jsonb • not null |
| `pricing_summary` (`pricingSummary`) | jsonb • not null |
| `expires_at` (`expiresAt`) | timestamp with time zone • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

## Bookings

### `booking_activity_log`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `booking_id` (`bookingId`) | text • FK -> bookings.id • not null |
| `actor_id` (`actorId`) | text • nullable |
| `activity_type` (`activityType`) | booking_activity_type • not null |
| `description` | text • not null |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |

### `booking_allocations`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `booking_id` (`bookingId`) | text • FK -> bookings.id • not null |
| `booking_item_id` (`bookingItemId`) | text • FK -> booking_items.id • not null |
| `product_id` (`productId`) | text • nullable |
| `option_id` (`optionId`) | text • nullable |
| `option_unit_id` (`optionUnitId`) | text • nullable |
| `pricing_category_id` (`pricingCategoryId`) | text • nullable |
| `availability_slot_id` (`availabilitySlotId`) | text • nullable |
| `quantity` | integer • not null • default 1 |
| `allocation_type` (`allocationType`) | booking_allocation_type • not null • default "unit" |
| `status` | booking_allocation_status • not null • default "held" |
| `hold_expires_at` (`holdExpiresAt`) | timestamp with time zone • nullable |
| `confirmed_at` (`confirmedAt`) | timestamp with time zone • nullable |
| `released_at` (`releasedAt`) | timestamp with time zone • nullable |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `booking_answers`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `booking_id` (`bookingId`) | text • not null |
| `product_booking_question_id` (`productBookingQuestionId`) | text • FK -> product_booking_questions.id • not null |
| `booking_traveler_id` (`bookingTravelerId`) | text • nullable |
| `booking_extra_id` (`bookingExtraId`) | text • nullable |
| `target` | booking_answer_target • not null • default "booking" |
| `value_text` (`valueText`) | text • nullable |
| `value_number` (`valueNumber`) | integer • nullable |
| `value_boolean` (`valueBoolean`) | boolean • nullable |
| `value_json` (`valueJson`) | jsonb • nullable |
| `notes` | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `booking_documents`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `booking_id` (`bookingId`) | text • FK -> bookings.id • not null |
| `traveler_id` (`travelerId`) | text • FK -> booking_travelers.id • nullable |
| `type` | booking_document_type • not null |
| `file_name` (`fileName`) | text • not null |
| `file_url` (`fileUrl`) | text • not null |
| `expires_at` (`expiresAt`) | timestamp with time zone • nullable |
| `notes` | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |

### `booking_extras`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `booking_id` (`bookingId`) | text • not null |
| `product_extra_id` (`productExtraId`) | text • nullable |
| `option_extra_config_id` (`optionExtraConfigId`) | text • nullable |
| `name` | text • not null |
| `description` | text • nullable |
| `status` | booking_extra_status • not null • default "draft" |
| `pricing_mode` (`pricingMode`) | extra_pricing_mode • not null • default "per_booking" |
| `priced_per_person` (`pricedPerPerson`) | boolean • not null • default false |
| `quantity` | integer • not null • default 1 |
| `sell_currency` (`sellCurrency`) | text • not null |
| `unit_sell_amount_cents` (`unitSellAmountCents`) | integer • nullable |
| `total_sell_amount_cents` (`totalSellAmountCents`) | integer • nullable |
| `cost_currency` (`costCurrency`) | text • nullable |
| `unit_cost_amount_cents` (`unitCostAmountCents`) | integer • nullable |
| `total_cost_amount_cents` (`totalCostAmountCents`) | integer • nullable |
| `notes` | text • nullable |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `booking_fulfillments`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `booking_id` (`bookingId`) | text • FK -> bookings.id • not null |
| `booking_item_id` (`bookingItemId`) | text • FK -> booking_items.id • nullable |
| `traveler_id` (`travelerId`) | text • FK -> booking_travelers.id • nullable |
| `fulfillment_type` (`fulfillmentType`) | booking_fulfillment_type • not null |
| `delivery_channel` (`deliveryChannel`) | booking_fulfillment_delivery_channel • not null |
| `status` | booking_fulfillment_status • not null • default "pending" |
| `artifact_url` (`artifactUrl`) | text • nullable |
| `payload` | jsonb • nullable |
| `issued_at` (`issuedAt`) | timestamp with time zone • nullable |
| `revoked_at` (`revokedAt`) | timestamp with time zone • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `booking_item_travelers`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `booking_item_id` (`bookingItemId`) | text • FK -> booking_items.id • not null |
| `traveler_id` (`travelerId`) | text • FK -> booking_travelers.id • not null |
| `role` | booking_item_participant_role • not null • default "traveler" |
| `is_primary` (`isPrimary`) | boolean • not null • default false |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |

### `booking_items`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `booking_id` (`bookingId`) | text • FK -> bookings.id • not null |
| `title` | text • not null |
| `description` | text • nullable |
| `item_type` (`itemType`) | booking_item_type • not null • default "unit" |
| `status` | booking_item_status • not null • default "draft" |
| `service_date` (`serviceDate`) | date • nullable |
| `starts_at` (`startsAt`) | timestamp with time zone • nullable |
| `ends_at` (`endsAt`) | timestamp with time zone • nullable |
| `quantity` | integer • not null • default 1 |
| `sell_currency` (`sellCurrency`) | text • not null |
| `unit_sell_amount_cents` (`unitSellAmountCents`) | integer • nullable |
| `total_sell_amount_cents` (`totalSellAmountCents`) | integer • nullable |
| `cost_currency` (`costCurrency`) | text • nullable |
| `unit_cost_amount_cents` (`unitCostAmountCents`) | integer • nullable |
| `total_cost_amount_cents` (`totalCostAmountCents`) | integer • nullable |
| `notes` | text • nullable |
| `product_id` (`productId`) | text • nullable |
| `option_id` (`optionId`) | text • nullable |
| `option_unit_id` (`optionUnitId`) | text • nullable |
| `pricing_category_id` (`pricingCategoryId`) | text • nullable |
| `availability_slot_id` (`availabilitySlotId`) | text • nullable |
| `product_name_snapshot` (`productNameSnapshot`) | text • nullable |
| `option_name_snapshot` (`optionNameSnapshot`) | text • nullable |
| `unit_name_snapshot` (`unitNameSnapshot`) | text • nullable |
| `departure_label_snapshot` (`departureLabelSnapshot`) | text • nullable |
| `source_snapshot_id` (`sourceSnapshotId`) | text • nullable |
| `source_offer_id` (`sourceOfferId`) | text • nullable |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `booking_notes`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `booking_id` (`bookingId`) | text • FK -> bookings.id • not null |
| `author_id` (`authorId`) | text • not null |
| `content` | text • not null |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |

### `booking_pii_access_log`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `booking_id` (`bookingId`) | text • nullable |
| `traveler_id` (`travelerId`) | text • nullable |
| `actor_id` (`actorId`) | text • nullable |
| `actor_type` (`actorType`) | text • nullable |
| `caller_type` (`callerType`) | text • nullable |
| `action` | booking_pii_access_action • not null |
| `outcome` | booking_pii_access_outcome • not null |
| `reason` | text • nullable |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |

### `booking_question_extra_triggers`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `product_booking_question_id` (`productBookingQuestionId`) | text • FK -> product_booking_questions.id • not null |
| `product_extra_id` (`productExtraId`) | text • nullable |
| `option_extra_config_id` (`optionExtraConfigId`) | text • nullable |
| `trigger_mode` (`triggerMode`) | booking_question_trigger_mode • not null • default "required" |
| `min_quantity` (`minQuantity`) | integer • nullable |
| `active` | boolean • not null • default true |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `booking_question_option_triggers`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `product_booking_question_id` (`productBookingQuestionId`) | text • FK -> product_booking_questions.id • not null |
| `option_id` (`optionId`) | text • not null |
| `trigger_mode` (`triggerMode`) | booking_question_trigger_mode • not null • default "required" |
| `active` | boolean • not null • default true |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `booking_question_options`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `product_booking_question_id` (`productBookingQuestionId`) | text • FK -> product_booking_questions.id • not null |
| `value` | text • not null |
| `label` | text • not null |
| `sort_order` (`sortOrder`) | integer • not null • default 0 |
| `is_default` (`isDefault`) | boolean • not null • default false |
| `active` | boolean • not null • default true |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `booking_question_unit_triggers`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `product_booking_question_id` (`productBookingQuestionId`) | text • FK -> product_booking_questions.id • not null |
| `unit_id` (`unitId`) | text • not null |
| `trigger_mode` (`triggerMode`) | booking_question_trigger_mode • not null • default "required" |
| `min_quantity` (`minQuantity`) | integer • nullable |
| `active` | boolean • not null • default true |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `booking_redemption_events`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `booking_id` (`bookingId`) | text • FK -> bookings.id • not null |
| `booking_item_id` (`bookingItemId`) | text • FK -> booking_items.id • nullable |
| `traveler_id` (`travelerId`) | text • FK -> booking_travelers.id • nullable |
| `redeemed_at` (`redeemedAt`) | timestamp with time zone • not null • default |
| `redeemed_by` (`redeemedBy`) | text • nullable |
| `location` | text • nullable |
| `method` | booking_redemption_method • not null • default "manual" |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |

### `booking_session_states`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `booking_id` (`bookingId`) | text • FK -> bookings.id • not null |
| `state_key` (`stateKey`) | text • not null • default "wizard" |
| `current_step` (`currentStep`) | text • nullable |
| `completed_steps` (`completedSteps`) | jsonb • not null • default [] |
| `payload` | jsonb • nullable |
| `version` | integer • not null • default 1 |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `booking_supplier_statuses`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `booking_id` (`bookingId`) | text • FK -> bookings.id • not null |
| `supplier_service_id` (`supplierServiceId`) | text • nullable |
| `supplier_id` (`supplierId`) | text • nullable |
| `service_name` (`serviceName`) | text • not null |
| `status` | supplier_confirmation_status • not null • default "pending" |
| `supplier_reference` (`supplierReference`) | text • nullable |
| `cost_currency` (`costCurrency`) | text • not null |
| `cost_amount_cents` (`costAmountCents`) | integer • not null |
| `supplier_invoice_line_id` (`supplierInvoiceLineId`) | text • nullable |
| `notes` | text • nullable |
| `confirmed_at` (`confirmedAt`) | timestamp with time zone • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `booking_traveler_travel_details`
| Column | Type |
|--------|------|
| `traveler_id` (`travelerId`) | text • PK • FK -> booking_travelers.id • not null |
| `identity_encrypted` (`identityEncrypted`) | jsonb • nullable |
| `dietary_encrypted` (`dietaryEncrypted`) | jsonb • nullable |
| `accessibility_encrypted` (`accessibilityEncrypted`) | jsonb • nullable |
| `document_person_document_id` (`documentPersonDocumentId`) | text • nullable |
| `is_lead_traveler` (`isLeadTraveler`) | boolean • not null • default false |
| `sharing_group_id` (`sharingGroupId`) | text • nullable |
| `room_type_id` (`roomTypeId`) | text • nullable |
| `bed_preference` (`bedPreference`) | text • nullable |
| `allocations` | jsonb • not null • default |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `booking_travelers`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `booking_id` (`bookingId`) | text • FK -> bookings.id • not null |
| `person_id` (`personId`) | text • nullable |
| `participant_type` (`participantType`) | booking_participant_type • not null • default "traveler" |
| `traveler_category` (`travelerCategory`) | booking_traveler_category • nullable |
| `first_name` (`firstName`) | text • not null |
| `last_name` (`lastName`) | text • not null |
| `email` | text • nullable |
| `phone` | text • nullable |
| `preferred_language` (`preferredLanguage`) | text • nullable |
| `special_requests` (`specialRequests`) | text • nullable |
| `is_primary` (`isPrimary`) | boolean • not null • default false |
| `notes` | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `bookings`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `booking_number` (`bookingNumber`) | text • unique • not null |
| `status` | booking_status • not null • default "draft" |
| `person_id` (`personId`) | text • nullable |
| `organization_id` (`organizationId`) | text • nullable |
| `source_type` (`sourceType`) | booking_source_type • not null • default "manual" |
| `external_booking_ref` (`externalBookingRef`) | text • nullable |
| `communication_language` (`communicationLanguage`) | text • nullable |
| `contact_first_name` (`contactFirstName`) | text • nullable |
| `contact_last_name` (`contactLastName`) | text • nullable |
| `contact_party_type` (`contactPartyType`) | text • nullable |
| `contact_tax_id` (`contactTaxId`) | text • nullable |
| `contact_email` (`contactEmail`) | text • nullable |
| `contact_phone` (`contactPhone`) | text • nullable |
| `contact_preferred_language` (`contactPreferredLanguage`) | text • nullable |
| `contact_country` (`contactCountry`) | text • nullable |
| `contact_region` (`contactRegion`) | text • nullable |
| `contact_city` (`contactCity`) | text • nullable |
| `contact_address_line1` (`contactAddressLine1`) | text • nullable |
| `contact_address_line2` (`contactAddressLine2`) | text • nullable |
| `contact_postal_code` (`contactPostalCode`) | text • nullable |
| `sell_currency` (`sellCurrency`) | text • not null |
| `base_currency` (`baseCurrency`) | text • nullable |
| `fx_rate_set_id` (`fxRateSetId`) | text • nullable |
| `sell_amount_cents` (`sellAmountCents`) | integer • nullable |
| `base_sell_amount_cents` (`baseSellAmountCents`) | integer • nullable |
| `cost_amount_cents` (`costAmountCents`) | integer • nullable |
| `base_cost_amount_cents` (`baseCostAmountCents`) | integer • nullable |
| `margin_percent` (`marginPercent`) | integer • nullable |
| `start_date` (`startDate`) | date • nullable |
| `end_date` (`endDate`) | date • nullable |
| `pax` | integer • nullable |
| `internal_notes` (`internalNotes`) | text • nullable |
| `notifications_suppressed` (`notificationsSuppressed`) | boolean • not null • default false |
| `customer_payment_policy` (`customerPaymentPolicy`) | jsonb • nullable |
| `price_override` (`priceOverride`) | jsonb • nullable |
| `custom_fields` (`customFields`) | jsonb • not null • default |
| `hold_expires_at` (`holdExpiresAt`) | timestamp with time zone • nullable |
| `accepted_at` (`acceptedAt`) | timestamp with time zone • nullable |
| `confirmed_at` (`confirmedAt`) | timestamp with time zone • nullable |
| `expired_at` (`expiredAt`) | timestamp with time zone • nullable |
| `cancelled_at` (`cancelledAt`) | timestamp with time zone • nullable |
| `completed_at` (`completedAt`) | timestamp with time zone • nullable |
| `awaiting_payment_at` (`awaitingPaymentAt`) | timestamp with time zone • nullable |
| `paid_at` (`paidAt`) | timestamp with time zone • nullable |
| `redeemed_at` (`redeemedAt`) | timestamp with time zone • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `extra_participant_selections`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `booking_id` (`bookingId`) | text • not null |
| `booking_item_id` (`bookingItemId`) | text • nullable |
| `traveler_id` (`travelerId`) | text • not null |
| `product_extra_id` (`productExtraId`) | text • not null |
| `option_extra_config_id` (`optionExtraConfigId`) | text • nullable |
| `status` | extra_participant_selection_status • not null • default "selected" |
| `collection_mode` (`collectionMode`) | extra_collection_mode • not null • default "booking_total" |
| `collection_status` (`collectionStatus`) | extra_collection_status • not null • default "not_required" |
| `collection_currency` (`collectionCurrency`) | text • nullable |
| `collection_amount_cents` (`collectionAmountCents`) | integer • nullable |
| `collected_at` (`collectedAt`) | timestamp with time zone • nullable |
| `collected_by` (`collectedBy`) | text • nullable |
| `notes` | text • nullable |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `option_booking_questions`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `option_id` (`optionId`) | text • not null |
| `product_booking_question_id` (`productBookingQuestionId`) | text • FK -> product_booking_questions.id • not null |
| `is_required_override` (`isRequiredOverride`) | boolean • nullable |
| `active` | boolean • not null • default true |
| `sort_order` (`sortOrder`) | integer • not null • default 0 |
| `notes` | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `product_booking_questions`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `product_id` (`productId`) | text • not null |
| `code` | text • nullable |
| `label` | text • not null |
| `description` | text • nullable |
| `target` | booking_question_target • not null • default "booking" |
| `field_type` (`fieldType`) | booking_question_field_type • not null • default "text" |
| `placeholder` | text • nullable |
| `help_text` (`helpText`) | text • nullable |
| `is_required` (`isRequired`) | boolean • not null • default false |
| `active` | boolean • not null • default true |
| `sort_order` (`sortOrder`) | integer • not null • default 0 |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `product_contact_requirements`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `product_id` (`productId`) | text • not null |
| `option_id` (`optionId`) | text • nullable |
| `field_key` (`fieldKey`) | contact_requirement_field • not null |
| `scope` | contact_requirement_scope • not null • default "traveler" |
| `is_required` (`isRequired`) | boolean • not null • default false |
| `per_traveler` (`perTraveler`) | boolean • not null • default false |
| `active` | boolean • not null • default true |
| `sort_order` (`sortOrder`) | integer • not null • default 0 |
| `notes` | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

## Operations

### `allocation_audit_log`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `slot_id` (`slotId`) | text • FK -> availability_slots.id • not null |
| `action` | text • not null |
| `actor_id` (`actorId`) | text • nullable |
| `traveler_id` (`travelerId`) | text • nullable |
| `resource_id` (`resourceId`) | text • nullable |
| `before` | jsonb • nullable |
| `after` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |

### `allocation_resources`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `slot_id` (`slotId`) | text • FK -> availability_slots.id • not null |
| `kind` | text • not null |
| `ref_type` (`refType`) | text • nullable |
| `ref_id` (`refId`) | text • nullable |
| `label` | text • nullable |
| `capacity` | integer • not null |
| `flags` | jsonb • not null • default |
| `parent_id` (`parentId`) | text • nullable |
| `sort_order` (`sortOrder`) | integer • not null • default 0 |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `availability_closeouts`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `product_id` (`productId`) | text • not null |
| `slot_id` (`slotId`) | text • FK -> availability_slots.id • nullable |
| `date_local` (`dateLocal`) | date • not null |
| `reason` | text • nullable |
| `created_by` (`createdBy`) | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |

### `availability_holds`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `draft_id` (`draftId`) | text • not null |
| `hold_token` (`holdToken`) | text • not null |
| `product_id` (`productId`) | text • not null |
| `slot_id` (`slotId`) | text • FK -> availability_slots.id • not null |
| `pax_count` (`paxCount`) | integer • not null |
| `expires_at` (`expiresAt`) | timestamp with time zone • not null |
| `released_at` (`releasedAt`) | timestamp with time zone • nullable |
| `converted_at` (`convertedAt`) | timestamp with time zone • nullable |
| `converted_booking_id` (`convertedBookingId`) | text • nullable |
| `converted_allocation_id` (`convertedAllocationId`) | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `availability_pickup_points`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `product_id` (`productId`) | text • not null |
| `facility_id` (`facilityId`) | text • nullable |
| `name` | text • not null |
| `description` | text • nullable |
| `location_text` (`locationText`) | text • nullable |
| `active` | boolean • not null • default true |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `availability_rules`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `product_id` (`productId`) | text • not null |
| `option_id` (`optionId`) | text • nullable |
| `facility_id` (`facilityId`) | text • nullable |
| `timezone` | text • not null |
| `recurrence_rule` (`recurrenceRule`) | text • not null |
| `max_capacity` (`maxCapacity`) | integer • not null |
| `max_pickup_capacity` (`maxPickupCapacity`) | integer • nullable |
| `min_total_pax` (`minTotalPax`) | integer • nullable |
| `cutoff_minutes` (`cutoffMinutes`) | integer • nullable |
| `early_booking_limit_minutes` (`earlyBookingLimitMinutes`) | integer • nullable |
| `active` | boolean • not null • default true |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `availability_slot_pickups`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `slot_id` (`slotId`) | text • FK -> availability_slots.id • not null |
| `pickup_point_id` (`pickupPointId`) | text • FK -> availability_pickup_points.id • not null |
| `initial_capacity` (`initialCapacity`) | integer • nullable |
| `remaining_capacity` (`remainingCapacity`) | integer • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `availability_slots`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `product_id` (`productId`) | text • not null |
| `itinerary_id` (`itineraryId`) | text • nullable |
| `option_id` (`optionId`) | text • nullable |
| `facility_id` (`facilityId`) | text • nullable |
| `availability_rule_id` (`availabilityRuleId`) | text • FK -> availability_rules.id • nullable |
| `start_time_id` (`startTimeId`) | text • FK -> availability_start_times.id • nullable |
| `date_local` (`dateLocal`) | date • not null |
| `starts_at` (`startsAt`) | timestamp with time zone • not null |
| `ends_at` (`endsAt`) | timestamp with time zone • nullable |
| `timezone` | text • not null |
| `status` | availability_slot_status • not null • default "open" |
| `unlimited` | boolean • not null • default false |
| `initial_pax` (`initialPax`) | integer • nullable |
| `remaining_pax` (`remainingPax`) | integer • nullable |
| `initial_pickups` (`initialPickups`) | integer • nullable |
| `remaining_pickups` (`remainingPickups`) | integer • nullable |
| `remaining_resources` (`remainingResources`) | integer • nullable |
| `past_cutoff` (`pastCutoff`) | boolean • not null • default false |
| `too_early` (`tooEarly`) | boolean • not null • default false |
| `nights` | integer • nullable |
| `days` | integer • nullable |
| `notes` | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `availability_start_times`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `product_id` (`productId`) | text • not null |
| `option_id` (`optionId`) | text • nullable |
| `facility_id` (`facilityId`) | text • nullable |
| `label` | text • nullable |
| `start_time_local` (`startTimeLocal`) | text • not null |
| `duration_minutes` (`durationMinutes`) | integer • nullable |
| `sort_order` (`sortOrder`) | integer • not null • default 0 |
| `active` | boolean • not null • default true |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `custom_pickup_areas`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `meeting_config_id` (`meetingConfigId`) | text • FK -> product_meeting_configs.id • not null |
| `name` | text • not null |
| `description` | text • nullable |
| `geographic_text` (`geographicText`) | text • nullable |
| `active` | boolean • not null • default true |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `facilities`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `parent_facility_id` (`parentFacilityId`) | text • FK -> facilities.id • nullable |
| `owner_type` (`ownerType`) | facility_owner_type • nullable |
| `owner_id` (`ownerId`) | text • nullable |
| `kind` | facility_kind • not null |
| `status` | facility_status • not null • default "active" |
| `name` | text • not null |
| `code` | text • nullable |
| `description` | text • nullable |
| `timezone` | text • nullable |
| `tags` | jsonb • not null • default [] |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `facility_address_projections`
| Column | Type |
|--------|------|
| `facility_id` (`facilityId`) | text • PK • FK -> facilities.id • not null |
| `address_id` (`addressId`) | text • nullable |
| `full_text` (`fullText`) | text • nullable |
| `line1` | text • nullable |
| `line2` | text • nullable |
| `city` | text • nullable |
| `region` | text • nullable |
| `postal_code` (`postalCode`) | text • nullable |
| `country` | text • nullable |
| `latitude` | double precision • nullable |
| `longitude` | double precision • nullable |
| `address` | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `facility_features`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `facility_id` (`facilityId`) | text • FK -> facilities.id • not null |
| `category` | facility_feature_category • not null • default "amenity" |
| `code` | text • nullable |
| `name` | text • not null |
| `description` | text • nullable |
| `value_text` (`valueText`) | text • nullable |
| `highlighted` | boolean • not null • default false |
| `sort_order` (`sortOrder`) | integer • not null • default 0 |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `facility_operation_schedules`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `facility_id` (`facilityId`) | text • FK -> facilities.id • not null |
| `day_of_week` (`dayOfWeek`) | facility_day_of_week • nullable |
| `valid_from` (`validFrom`) | date • nullable |
| `valid_to` (`validTo`) | date • nullable |
| `opens_at` (`opensAt`) | text • nullable |
| `closes_at` (`closesAt`) | text • nullable |
| `closed` | boolean • not null • default false |
| `notes` | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `function_space_capacities`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `space_id` (`spaceId`) | text • FK -> function_spaces.id • not null |
| `layout` | function_space_layout • not null |
| `capacity` | integer • not null |

### `function_spaces`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `facility_id` (`facilityId`) | text • FK -> facilities.id • not null |
| `parent_space_id` (`parentSpaceId`) | text • FK -> function_spaces.id • nullable |
| `name` | text • not null |
| `code` | text • nullable |
| `description` | text • nullable |
| `area_sqm` (`areaSqm`) | double precision • nullable |
| `divisible` | boolean • not null • default false |
| `default_layout` (`defaultLayout`) | function_space_layout • nullable |
| `active` | boolean • not null • default true |
| `sort_order` (`sortOrder`) | integer • not null • default 0 |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `ground_dispatch_assignments`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `dispatch_id` (`dispatchId`) | text • FK -> ground_dispatches.id • not null |
| `operator_id` (`operatorId`) | text • FK -> ground_operators.id • nullable |
| `vehicle_id` (`vehicleId`) | text • FK -> ground_vehicles.id • nullable |
| `driver_id` (`driverId`) | text • FK -> ground_drivers.id • nullable |
| `assignment_source` (`assignmentSource`) | ground_assignment_source • not null • default "manual" |
| `assigned_at` (`assignedAt`) | timestamp with time zone • not null • default |
| `accepted_at` (`acceptedAt`) | timestamp with time zone • nullable |
| `notes` | text • nullable |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `ground_dispatch_checkpoints`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `dispatch_id` (`dispatchId`) | text • FK -> ground_dispatches.id • not null |
| `sequence` | integer • not null • default 0 |
| `checkpoint_type` (`checkpointType`) | text • not null |
| `status` | ground_checkpoint_status • not null • default "pending" |
| `planned_at` (`plannedAt`) | timestamp with time zone • nullable |
| `actual_at` (`actualAt`) | timestamp with time zone • nullable |
| `facility_id` (`facilityId`) | text • nullable |
| `address_id` (`addressId`) | text • FK -> identity_addresses.id • nullable |
| `notes` | text • nullable |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `ground_dispatch_legs`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `dispatch_id` (`dispatchId`) | text • FK -> ground_dispatches.id • not null |
| `sequence` | integer • not null • default 0 |
| `leg_type` (`legType`) | ground_dispatch_leg_type • not null • default "pickup" |
| `facility_id` (`facilityId`) | text • nullable |
| `address_id` (`addressId`) | text • FK -> identity_addresses.id • nullable |
| `scheduled_at` (`scheduledAt`) | timestamp with time zone • nullable |
| `actual_at` (`actualAt`) | timestamp with time zone • nullable |
| `notes` | text • nullable |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `ground_dispatch_passengers`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `dispatch_id` (`dispatchId`) | text • FK -> ground_dispatches.id • not null |
| `participant_id` (`participantId`) | text • nullable |
| `display_name` (`displayName`) | text • nullable |
| `seat_label` (`seatLabel`) | text • nullable |
| `notes` | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `ground_dispatches`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `transfer_preference_id` (`transferPreferenceId`) | text • FK -> ground_transfer_preferences.id • not null |
| `booking_id` (`bookingId`) | text • not null |
| `booking_item_id` (`bookingItemId`) | text • nullable |
| `operator_id` (`operatorId`) | text • FK -> ground_operators.id • nullable |
| `vehicle_id` (`vehicleId`) | text • FK -> ground_vehicles.id • nullable |
| `driver_id` (`driverId`) | text • FK -> ground_drivers.id • nullable |
| `service_date` (`serviceDate`) | date • nullable |
| `scheduled_pickup_at` (`scheduledPickupAt`) | timestamp with time zone • nullable |
| `scheduled_dropoff_at` (`scheduledDropoffAt`) | timestamp with time zone • nullable |
| `actual_pickup_at` (`actualPickupAt`) | timestamp with time zone • nullable |
| `actual_dropoff_at` (`actualDropoffAt`) | timestamp with time zone • nullable |
| `status` | ground_dispatch_status • not null • default "draft" |
| `passenger_count` (`passengerCount`) | integer • nullable |
| `checked_bags` (`checkedBags`) | integer • nullable |
| `carry_on_bags` (`carryOnBags`) | integer • nullable |
| `notes` | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `ground_driver_shifts`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `driver_id` (`driverId`) | text • FK -> ground_drivers.id • not null |
| `operator_id` (`operatorId`) | text • FK -> ground_operators.id • nullable |
| `facility_id` (`facilityId`) | text • nullable |
| `starts_at` (`startsAt`) | timestamp with time zone • not null |
| `ends_at` (`endsAt`) | timestamp with time zone • not null |
| `status` | ground_driver_shift_status • not null • default "scheduled" |
| `notes` | text • nullable |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `ground_drivers`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `resource_id` (`resourceId`) | text • not null |
| `operator_id` (`operatorId`) | text • FK -> ground_operators.id • nullable |
| `license_number` (`licenseNumber`) | text • nullable |
| `spoken_languages` (`spokenLanguages`) | jsonb • not null • default [] |
| `is_guide` (`isGuide`) | boolean • not null • default false |
| `is_meet_and_greet_capable` (`isMeetAndGreetCapable`) | boolean • not null • default false |
| `active` | boolean • not null • default true |
| `notes` | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `ground_execution_events`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `dispatch_id` (`dispatchId`) | text • FK -> ground_dispatches.id • not null |
| `event_type` (`eventType`) | ground_execution_event_type • not null • default "note" |
| `occurred_at` (`occurredAt`) | timestamp with time zone • not null • default |
| `facility_id` (`facilityId`) | text • nullable |
| `address_id` (`addressId`) | text • FK -> identity_addresses.id • nullable |
| `notes` | text • nullable |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |

### `ground_operators`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `supplier_id` (`supplierId`) | text • nullable |
| `facility_id` (`facilityId`) | text • nullable |
| `name` | text • not null |
| `code` | text • nullable |
| `active` | boolean • not null • default true |
| `notes` | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `ground_service_incidents`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `dispatch_id` (`dispatchId`) | text • FK -> ground_dispatches.id • not null |
| `severity` | ground_incident_severity • not null • default "warning" |
| `incident_type` (`incidentType`) | text • not null |
| `resolution_status` (`resolutionStatus`) | ground_incident_resolution_status • not null • default "open" |
| `opened_at` (`openedAt`) | timestamp with time zone • not null • default |
| `resolved_at` (`resolvedAt`) | timestamp with time zone • nullable |
| `notes` | text • nullable |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `ground_transfer_preferences`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `booking_id` (`bookingId`) | text • not null |
| `booking_item_id` (`bookingItemId`) | text • nullable |
| `pickup_facility_id` (`pickupFacilityId`) | text • nullable |
| `dropoff_facility_id` (`dropoffFacilityId`) | text • nullable |
| `pickup_address_id` (`pickupAddressId`) | text • FK -> identity_addresses.id • nullable |
| `dropoff_address_id` (`dropoffAddressId`) | text • FK -> identity_addresses.id • nullable |
| `requested_vehicle_category` (`requestedVehicleCategory`) | ground_vehicle_category • nullable |
| `requested_vehicle_class` (`requestedVehicleClass`) | ground_vehicle_class • nullable |
| `service_level` (`serviceLevel`) | ground_service_level • not null • default "private" |
| `passenger_count` (`passengerCount`) | integer • nullable |
| `checked_bags` (`checkedBags`) | integer • nullable |
| `carry_on_bags` (`carryOnBags`) | integer • nullable |
| `wheelchair_count` (`wheelchairCount`) | integer • nullable |
| `child_seat_count` (`childSeatCount`) | integer • nullable |
| `driver_language` (`driverLanguage`) | text • nullable |
| `meet_and_greet` (`meetAndGreet`) | boolean • not null • default false |
| `accessibility_notes` (`accessibilityNotes`) | text • nullable |
| `pickup_notes` (`pickupNotes`) | text • nullable |
| `dropoff_notes` (`dropoffNotes`) | text • nullable |
| `notes` | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `ground_vehicles`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `resource_id` (`resourceId`) | text • not null |
| `operator_id` (`operatorId`) | text • FK -> ground_operators.id • nullable |
| `category` | ground_vehicle_category • not null • default "other" |
| `vehicle_class` (`vehicleClass`) | ground_vehicle_class • not null • default "standard" |
| `passenger_capacity` (`passengerCapacity`) | integer • nullable |
| `checked_bag_capacity` (`checkedBagCapacity`) | integer • nullable |
| `carry_on_capacity` (`carryOnCapacity`) | integer • nullable |
| `wheelchair_capacity` (`wheelchairCapacity`) | integer • nullable |
| `child_seat_capacity` (`childSeatCapacity`) | integer • nullable |
| `is_accessible` (`isAccessible`) | boolean • not null • default false |
| `active` | boolean • not null • default true |
| `notes` | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `location_pickup_times`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `pickup_location_id` (`pickupLocationId`) | text • FK -> pickup_locations.id • not null |
| `slot_id` (`slotId`) | text • FK -> availability_slots.id • nullable |
| `start_time_id` (`startTimeId`) | text • FK -> availability_start_times.id • nullable |
| `timing_mode` (`timingMode`) | pickup_timing_mode • not null • default "fixed_time" |
| `local_time` (`localTime`) | text • nullable |
| `offset_minutes` (`offsetMinutes`) | integer • nullable |
| `instructions` | text • nullable |
| `initial_capacity` (`initialCapacity`) | integer • nullable |
| `remaining_capacity` (`remainingCapacity`) | integer • nullable |
| `active` | boolean • not null • default true |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `pickup_groups`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `meeting_config_id` (`meetingConfigId`) | text • FK -> product_meeting_configs.id • not null |
| `kind` | pickup_group_kind • not null |
| `name` | text • not null |
| `description` | text • nullable |
| `active` | boolean • not null • default true |
| `sort_order` (`sortOrder`) | integer • not null • default 0 |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `pickup_locations`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `group_id` (`groupId`) | text • FK -> pickup_groups.id • not null |
| `facility_id` (`facilityId`) | text • nullable |
| `name` | text • not null |
| `description` | text • nullable |
| `location_text` (`locationText`) | text • nullable |
| `lead_time_minutes` (`leadTimeMinutes`) | integer • nullable |
| `active` | boolean • not null • default true |
| `sort_order` (`sortOrder`) | integer • not null • default 0 |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `product_meeting_configs`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `product_id` (`productId`) | text • not null |
| `option_id` (`optionId`) | text • nullable |
| `facility_id` (`facilityId`) | text • nullable |
| `mode` | meeting_mode • not null • default "meeting_only" |
| `allow_custom_pickup` (`allowCustomPickup`) | boolean • not null • default false |
| `allow_custom_dropoff` (`allowCustomDropoff`) | boolean • not null • default false |
| `requires_pickup_selection` (`requiresPickupSelection`) | boolean • not null • default false |
| `requires_dropoff_selection` (`requiresDropoffSelection`) | boolean • not null • default false |
| `use_pickup_allotment` (`usePickupAllotment`) | boolean • not null • default false |
| `meeting_instructions` (`meetingInstructions`) | text • nullable |
| `pickup_instructions` (`pickupInstructions`) | text • nullable |
| `dropoff_instructions` (`dropoffInstructions`) | text • nullable |
| `active` | boolean • not null • default true |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `product_option_resource_templates`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `product_option_id` (`productOptionId`) | text • not null |
| `kind` | text • not null |
| `ref_type` (`refType`) | text • nullable |
| `ref_id` (`refId`) | text • nullable |
| `capacity` | integer • not null |
| `name_pattern` (`namePattern`) | text • not null |
| `layout` | text • nullable |
| `default_count` (`defaultCount`) | integer • nullable |
| `flags` | jsonb • not null • default |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `properties`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `facility_id` (`facilityId`) | text • FK -> facilities.id • not null |
| `property_type` (`propertyType`) | property_type • not null • default "hotel" |
| `brand_name` (`brandName`) | text • nullable |
| `group_name` (`groupName`) | text • nullable |
| `rating` | integer • nullable |
| `rating_scale` (`ratingScale`) | integer • nullable |
| `check_in_time` (`checkInTime`) | text • nullable |
| `check_out_time` (`checkOutTime`) | text • nullable |
| `policy_notes` (`policyNotes`) | text • nullable |
| `amenity_notes` (`amenityNotes`) | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `property_group_members`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `group_id` (`groupId`) | text • FK -> property_groups.id • not null |
| `property_id` (`propertyId`) | text • FK -> properties.id • not null |
| `membership_role` (`membershipRole`) | property_group_membership_role • not null • default "member" |
| `is_primary` (`isPrimary`) | boolean • not null • default false |
| `valid_from` (`validFrom`) | date • nullable |
| `valid_to` (`validTo`) | date • nullable |
| `notes` | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `property_groups`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `parent_group_id` (`parentGroupId`) | text • FK -> property_groups.id • nullable |
| `group_type` (`groupType`) | property_group_type • not null • default "chain" |
| `status` | property_group_status • not null • default "active" |
| `name` | text • not null |
| `code` | text • nullable |
| `brand_name` (`brandName`) | text • nullable |
| `legal_name` (`legalName`) | text • nullable |
| `website` | text • nullable |
| `notes` | text • nullable |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `resource_closeouts`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `resource_id` (`resourceId`) | text • FK -> resources.id • not null |
| `date_local` (`dateLocal`) | date • not null |
| `starts_at` (`startsAt`) | timestamp with time zone • nullable |
| `ends_at` (`endsAt`) | timestamp with time zone • nullable |
| `reason` | text • nullable |
| `created_by` (`createdBy`) | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |

### `resource_pool_members`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `pool_id` (`poolId`) | text • FK -> resource_pools.id • not null |
| `resource_id` (`resourceId`) | text • FK -> resources.id • not null |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |

### `resource_pools`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `product_id` (`productId`) | text • nullable |
| `kind` | resource_kind • not null |
| `name` | text • not null |
| `shared_capacity` (`sharedCapacity`) | integer • nullable |
| `active` | boolean • not null • default true |
| `notes` | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `resource_requirements`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `pool_id` (`poolId`) | text • FK -> resource_pools.id • not null |
| `product_id` (`productId`) | text • not null |
| `availability_rule_id` (`availabilityRuleId`) | text • nullable |
| `start_time_id` (`startTimeId`) | text • nullable |
| `quantity_required` (`quantityRequired`) | integer • not null • default 1 |
| `allocation_mode` (`allocationMode`) | resource_allocation_mode • not null • default "shared" |
| `priority` | integer • not null • default 0 |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `resource_slot_assignments`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `slot_id` (`slotId`) | text • not null |
| `pool_id` (`poolId`) | text • FK -> resource_pools.id • nullable |
| `resource_id` (`resourceId`) | text • FK -> resources.id • nullable |
| `booking_id` (`bookingId`) | text • nullable |
| `status` | resource_assignment_status • not null • default "reserved" |
| `assigned_at` (`assignedAt`) | timestamp with time zone • not null • default |
| `assigned_by` (`assignedBy`) | text • nullable |
| `released_at` (`releasedAt`) | timestamp with time zone • nullable |
| `notes` | text • nullable |

### `resources`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `supplier_id` (`supplierId`) | text • nullable |
| `facility_id` (`facilityId`) | text • nullable |
| `kind` | resource_kind • not null |
| `name` | text • not null |
| `code` | text • nullable |
| `capacity` | integer • nullable |
| `active` | boolean • not null • default true |
| `notes` | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `sharing_group_labels`
| Column | Type |
|--------|------|
| `group_id` (`groupId`) | text • PK • not null |
| `label` | text • not null |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `space_block_pickups`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `block_id` (`blockId`) | text • FK -> space_blocks.id • not null |
| `booking_id` (`bookingId`) | text • nullable |
| `session_id` (`sessionId`) | text • nullable |
| `start_date` (`startDate`) | date • not null |
| `end_date` (`endDate`) | date • not null |
| `units` | integer • not null • default 1 |
| `status` | space_block_pickup_status • not null • default "active" |
| `picked_up_at` (`pickedUpAt`) | timestamp with time zone • not null • default |
| `reversed_at` (`reversedAt`) | timestamp with time zone • nullable |

### `space_block_slots`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `block_id` (`blockId`) | text • FK -> space_blocks.id • not null |
| `date` | date • not null |
| `units_held` (`unitsHeld`) | integer • not null • default 0 |
| `units_picked_up` (`unitsPickedUp`) | integer • not null • default 0 |
| `units_released` (`unitsReleased`) | integer • not null • default 0 |
| `net_rate_cents_override` (`netRateCentsOverride`) | integer • nullable |
| `sell_rate_cents_override` (`sellRateCentsOverride`) | integer • nullable |

### `space_blocks`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `function_space_id` (`functionSpaceId`) | text • FK -> function_spaces.id • not null |
| `program_id` (`programId`) | text • nullable |
| `supplier_id` (`supplierId`) | text • nullable |
| `name` | text • not null |
| `status` | space_block_status • not null • default "inquiry" |
| `currency` | text • nullable |
| `net_rate_cents` (`netRateCents`) | integer • nullable |
| `sell_rate_cents` (`sellRateCents`) | integer • nullable |
| `hold_start_time` (`holdStartTime`) | text • nullable |
| `hold_end_time` (`holdEndTime`) | text • nullable |
| `option_date` (`optionDate`) | date • nullable |
| `cutoff_date` (`cutoffDate`) | date • nullable |
| `attrition_terms` (`attritionTerms`) | jsonb • nullable |
| `notes` | text • nullable |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

## Distribution

### `booking_distribution_details`
| Column | Type |
|--------|------|
| `booking_id` (`bookingId`) | text • PK • not null |
| `market_id` (`marketId`) | text • nullable |
| `source_channel_id` (`sourceChannelId`) | text • nullable |
| `fx_rate_set_id` (`fxRateSetId`) | text • nullable |
| `payment_owner` (`paymentOwner`) | booking_dist_payment_owner • not null • default "operator" |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `channel_availability_push_intents`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `channel_id` (`channelId`) | text • FK -> channels.id • not null |
| `source_connection_id` (`sourceConnectionId`) | text • not null |
| `slot_id` (`slotId`) | text • not null |
| `product_id` (`productId`) | text • not null |
| `option_id` (`optionId`) | text • nullable |
| `starts_at` (`startsAt`) | timestamp with time zone • not null |
| `requested_at` (`requestedAt`) | timestamp with time zone • not null • default |
| `attempts` | integer • not null • default 0 |
| `last_error` (`lastError`) | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `channel_booking_links`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `channel_id` (`channelId`) | text • FK -> channels.id • not null |
| `booking_id` (`bookingId`) | text • not null |
| `booking_item_id` (`bookingItemId`) | text • nullable |
| `external_booking_id` (`externalBookingId`) | text • nullable |
| `external_reference` (`externalReference`) | text • nullable |
| `external_status` (`externalStatus`) | text • nullable |
| `booked_at_external` (`bookedAtExternal`) | timestamp with time zone • nullable |
| `last_synced_at` (`lastSyncedAt`) | timestamp with time zone • nullable |
| `source_kind` (`sourceKind`) | text • nullable |
| `source_connection_id` (`sourceConnectionId`) | text • nullable |
| `push_status` (`pushStatus`) | text • not null • default "pending" |
| `push_attempts` (`pushAttempts`) | integer • not null • default 0 |
| `last_push_at` (`lastPushAt`) | timestamp with time zone • nullable |
| `last_error` (`lastError`) | text • nullable |
| `pushed_payload_hash` (`pushedPayloadHash`) | text • nullable |
| `idempotency_key` (`idempotencyKey`) | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `channel_commission_rules`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `contract_id` (`contractId`) | text • FK -> channel_contracts.id • not null |
| `scope` | channel_commission_scope • not null |
| `product_id` (`productId`) | text • nullable |
| `external_rate_id` (`externalRateId`) | text • nullable |
| `external_category_id` (`externalCategoryId`) | text • nullable |
| `commission_type` (`commissionType`) | channel_commission_type • not null |
| `amount_cents` (`amountCents`) | integer • nullable |
| `percent_basis_points` (`percentBasisPoints`) | integer • nullable |
| `valid_from` (`validFrom`) | date • nullable |
| `valid_to` (`validTo`) | date • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `channel_contact_projections`
| Column | Type |
|--------|------|
| `channel_id` (`channelId`) | text • PK • FK -> channels.id • not null |
| `website_contact_point_id` (`websiteContactPointId`) | text • nullable |
| `primary_named_contact_id` (`primaryNamedContactId`) | text • nullable |
| `website` | text • nullable |
| `contact_name` (`contactName`) | text • nullable |
| `contact_email` (`contactEmail`) | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `channel_content_push_intents`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `channel_id` (`channelId`) | text • FK -> channels.id • not null |
| `source_connection_id` (`sourceConnectionId`) | text • not null |
| `product_id` (`productId`) | text • not null |
| `requested_at` (`requestedAt`) | timestamp with time zone • not null • default |
| `attempts` | integer • not null • default 0 |
| `last_error` (`lastError`) | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `channel_contracts`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `channel_id` (`channelId`) | text • FK -> channels.id • not null |
| `supplier_id` (`supplierId`) | text • FK -> suppliers.id • nullable |
| `status` | channel_contract_status • not null • default "draft" |
| `starts_at` (`startsAt`) | date • not null |
| `ends_at` (`endsAt`) | date • nullable |
| `payment_owner` (`paymentOwner`) | distribution_payment_owner • not null • default "operator" |
| `cancellation_owner` (`cancellationOwner`) | distribution_cancellation_owner • not null • default "operator" |
| `settlement_terms` (`settlementTerms`) | text • nullable |
| `notes` | text • nullable |
| `rate_limit_rps` (`rateLimitRps`) | integer • nullable |
| `rate_limit_burst` (`rateLimitBurst`) | integer • nullable |
| `rate_limit_priority_gates` (`rateLimitPriorityGates`) | jsonb • nullable |
| `policy` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `channel_inventory_allotment_targets`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `allotment_id` (`allotmentId`) | text • FK -> channel_inventory_allotments.id • not null |
| `slot_id` (`slotId`) | text • nullable |
| `start_time_id` (`startTimeId`) | text • nullable |
| `date_local` (`dateLocal`) | date • nullable |
| `guaranteed_capacity` (`guaranteedCapacity`) | integer • nullable |
| `max_capacity` (`maxCapacity`) | integer • nullable |
| `sold_capacity` (`soldCapacity`) | integer • nullable |
| `remaining_capacity` (`remainingCapacity`) | integer • nullable |
| `active` | boolean • not null • default true |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `channel_inventory_allotments`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `channel_id` (`channelId`) | text • FK -> channels.id • not null |
| `contract_id` (`contractId`) | text • FK -> channel_contracts.id • nullable |
| `product_id` (`productId`) | text • not null |
| `option_id` (`optionId`) | text • nullable |
| `start_time_id` (`startTimeId`) | text • nullable |
| `valid_from` (`validFrom`) | date • nullable |
| `valid_to` (`validTo`) | date • nullable |
| `guaranteed_capacity` (`guaranteedCapacity`) | integer • nullable |
| `max_capacity` (`maxCapacity`) | integer • nullable |
| `active` | boolean • not null • default true |
| `notes` | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `channel_inventory_release_executions`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `allotment_id` (`allotmentId`) | text • FK -> channel_inventory_allotments.id • not null |
| `release_rule_id` (`releaseRuleId`) | text • FK -> channel_inventory_release_rules.id • nullable |
| `target_id` (`targetId`) | text • FK -> channel_inventory_allotment_targets.id • nullable |
| `slot_id` (`slotId`) | text • nullable |
| `action_taken` (`actionTaken`) | channel_release_execution_action • not null • default "released" |
| `status` | channel_release_execution_status • not null • default "pending" |
| `released_capacity` (`releasedCapacity`) | integer • nullable |
| `executed_at` (`executedAt`) | timestamp with time zone • nullable |
| `notes` | text • nullable |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `channel_inventory_release_rules`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `allotment_id` (`allotmentId`) | text • FK -> channel_inventory_allotments.id • not null |
| `release_mode` (`releaseMode`) | channel_allotment_release_mode • not null • default "automatic" |
| `release_days_before_start` (`releaseDaysBeforeStart`) | integer • nullable |
| `release_hours_before_start` (`releaseHoursBeforeStart`) | integer • nullable |
| `unsold_action` (`unsoldAction`) | channel_allotment_unsold_action • not null • default "release_to_general_pool" |
| `notes` | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `channel_product_mappings`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `channel_id` (`channelId`) | text • FK -> channels.id • not null |
| `product_id` (`productId`) | text • not null |
| `external_product_id` (`externalProductId`) | text • nullable |
| `external_rate_id` (`externalRateId`) | text • nullable |
| `external_category_id` (`externalCategoryId`) | text • nullable |
| `active` | boolean • not null • default true |
| `source_kind` (`sourceKind`) | text • nullable |
| `source_connection_id` (`sourceConnectionId`) | text • nullable |
| `push_bookings` (`pushBookings`) | boolean • not null • default true |
| `push_availability` (`pushAvailability`) | boolean • not null • default true |
| `push_content` (`pushContent`) | boolean • not null • default true |
| `policy` | jsonb • nullable |
| `last_pushed_content_hash` (`lastPushedContentHash`) | text • nullable |
| `last_pushed_content_at` (`lastPushedContentAt`) | timestamp with time zone • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `channel_push_job_leases`
| Column | Type |
|--------|------|
| `job_id` (`jobId`) | text • PK • not null |
| `owner` | text • not null |
| `lease_until` (`leaseUntil`) | timestamp with time zone • not null |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `channel_reconciliation_items`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `reconciliation_run_id` (`reconciliationRunId`) | text • FK -> channel_reconciliation_runs.id • not null |
| `booking_link_id` (`bookingLinkId`) | text • FK -> channel_booking_links.id • nullable |
| `booking_id` (`bookingId`) | text • nullable |
| `external_booking_id` (`externalBookingId`) | text • nullable |
| `issue_type` (`issueType`) | channel_reconciliation_issue_type • not null • default "other" |
| `severity` | channel_reconciliation_severity • not null • default "warning" |
| `resolution_status` (`resolutionStatus`) | channel_reconciliation_resolution_status • not null • default "open" |
| `notes` | text • nullable |
| `resolved_at` (`resolvedAt`) | timestamp with time zone • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `channel_reconciliation_policies`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `channel_id` (`channelId`) | text • FK -> channels.id • not null |
| `contract_id` (`contractId`) | text • FK -> channel_contracts.id • nullable |
| `frequency` | channel_reconciliation_policy_frequency • not null • default "manual" |
| `auto_run` (`autoRun`) | boolean • not null • default false |
| `compare_gross_amounts` (`compareGrossAmounts`) | boolean • not null • default true |
| `compare_statuses` (`compareStatuses`) | boolean • not null • default true |
| `compare_cancellations` (`compareCancellations`) | boolean • not null • default true |
| `amount_tolerance_cents` (`amountToleranceCents`) | integer • nullable |
| `active` | boolean • not null • default true |
| `notes` | text • nullable |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `channel_reconciliation_runs`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `channel_id` (`channelId`) | text • FK -> channels.id • not null |
| `contract_id` (`contractId`) | text • FK -> channel_contracts.id • nullable |
| `status` | channel_reconciliation_run_status • not null • default "draft" |
| `period_start` (`periodStart`) | date • nullable |
| `period_end` (`periodEnd`) | date • nullable |
| `external_report_reference` (`externalReportReference`) | text • nullable |
| `started_at` (`startedAt`) | timestamp with time zone • nullable |
| `completed_at` (`completedAt`) | timestamp with time zone • nullable |
| `notes` | text • nullable |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `channel_release_schedules`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `release_rule_id` (`releaseRuleId`) | text • FK -> channel_inventory_release_rules.id • not null |
| `schedule_kind` (`scheduleKind`) | channel_release_schedule_kind • not null • default "manual" |
| `next_run_at` (`nextRunAt`) | timestamp with time zone • nullable |
| `last_run_at` (`lastRunAt`) | timestamp with time zone • nullable |
| `active` | boolean • not null • default true |
| `notes` | text • nullable |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `channel_remittance_exceptions`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `channel_id` (`channelId`) | text • FK -> channels.id • not null |
| `settlement_item_id` (`settlementItemId`) | text • FK -> channel_settlement_items.id • nullable |
| `reconciliation_item_id` (`reconciliationItemId`) | text • FK -> channel_reconciliation_items.id • nullable |
| `exception_type` (`exceptionType`) | text • not null |
| `severity` | channel_reconciliation_severity • not null • default "warning" |
| `status` | channel_remittance_exception_status • not null • default "open" |
| `opened_at` (`openedAt`) | timestamp with time zone • not null • default |
| `resolved_at` (`resolvedAt`) | timestamp with time zone • nullable |
| `notes` | text • nullable |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `channel_settlement_approvals`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `settlement_run_id` (`settlementRunId`) | text • FK -> channel_settlement_runs.id • not null |
| `approver_user_id` (`approverUserId`) | text • nullable |
| `status` | channel_settlement_approval_status • not null • default "pending" |
| `decided_at` (`decidedAt`) | timestamp with time zone • nullable |
| `notes` | text • nullable |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `channel_settlement_items`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `settlement_run_id` (`settlementRunId`) | text • FK -> channel_settlement_runs.id • not null |
| `booking_link_id` (`bookingLinkId`) | text • FK -> channel_booking_links.id • nullable |
| `booking_id` (`bookingId`) | text • nullable |
| `commission_rule_id` (`commissionRuleId`) | text • FK -> channel_commission_rules.id • nullable |
| `status` | channel_settlement_item_status • not null • default "pending" |
| `gross_amount_cents` (`grossAmountCents`) | integer • not null • default 0 |
| `commission_amount_cents` (`commissionAmountCents`) | integer • not null • default 0 |
| `net_remittance_amount_cents` (`netRemittanceAmountCents`) | integer • not null • default 0 |
| `currency_code` (`currencyCode`) | text • nullable |
| `remittance_due_at` (`remittanceDueAt`) | timestamp with time zone • nullable |
| `paid_at` (`paidAt`) | timestamp with time zone • nullable |
| `notes` | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `channel_settlement_policies`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `channel_id` (`channelId`) | text • FK -> channels.id • not null |
| `contract_id` (`contractId`) | text • FK -> channel_contracts.id • nullable |
| `frequency` | channel_settlement_policy_frequency • not null • default "manual" |
| `auto_generate` (`autoGenerate`) | boolean • not null • default false |
| `approval_required` (`approvalRequired`) | boolean • not null • default false |
| `remittance_days_after_period_end` (`remittanceDaysAfterPeriodEnd`) | integer • nullable |
| `minimum_payout_amount_cents` (`minimumPayoutAmountCents`) | integer • nullable |
| `currency_code` (`currencyCode`) | text • nullable |
| `active` | boolean • not null • default true |
| `notes` | text • nullable |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `channel_settlement_runs`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `channel_id` (`channelId`) | text • FK -> channels.id • not null |
| `contract_id` (`contractId`) | text • FK -> channel_contracts.id • nullable |
| `status` | channel_settlement_run_status • not null • default "draft" |
| `currency_code` (`currencyCode`) | text • nullable |
| `period_start` (`periodStart`) | date • nullable |
| `period_end` (`periodEnd`) | date • nullable |
| `statement_reference` (`statementReference`) | text • nullable |
| `generated_at` (`generatedAt`) | timestamp with time zone • nullable |
| `posted_at` (`postedAt`) | timestamp with time zone • nullable |
| `paid_at` (`paidAt`) | timestamp with time zone • nullable |
| `notes` | text • nullable |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `channel_webhook_events`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `channel_id` (`channelId`) | text • FK -> channels.id • not null |
| `event_type` (`eventType`) | text • not null |
| `external_event_id` (`externalEventId`) | text • nullable |
| `payload` | jsonb • not null |
| `received_at` (`receivedAt`) | timestamp with time zone • not null • default |
| `processed_at` (`processedAt`) | timestamp with time zone • nullable |
| `status` | channel_webhook_status • not null • default "pending" |
| `error_message` (`errorMessage`) | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |

### `channels`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `name` | text • not null |
| `description` | text • nullable |
| `kind` | channel_kind • not null |
| `status` | channel_status • not null • default "active" |
| `metadata` | jsonb • nullable |
| `rate_limit_rps` (`rateLimitRps`) | integer • nullable |
| `rate_limit_burst` (`rateLimitBurst`) | integer • nullable |
| `rate_limit_priority_gates` (`rateLimitPriorityGates`) | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `external_refs`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `entity_type` (`entityType`) | text • not null |
| `entity_id` (`entityId`) | text • not null |
| `source_system` (`sourceSystem`) | text • not null |
| `object_type` (`objectType`) | text • not null |
| `namespace` | text • not null • default "default" |
| `external_id` (`externalId`) | text • not null |
| `external_parent_id` (`externalParentId`) | text • nullable |
| `is_primary` (`isPrimary`) | boolean • not null • default false |
| `status` | external_ref_status • not null • default "active" |
| `last_synced_at` (`lastSyncedAt`) | timestamp with time zone • nullable |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `supplier_availability`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `supplier_id` (`supplierId`) | text • FK -> suppliers.id • not null |
| `date` | date • not null |
| `available` | boolean • not null • default true |
| `notes` | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |

### `supplier_contracts`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `supplier_id` (`supplierId`) | text • FK -> suppliers.id • not null |
| `agreement_number` (`agreementNumber`) | text • nullable |
| `start_date` (`startDate`) | date • not null |
| `end_date` (`endDate`) | date • nullable |
| `renewal_date` (`renewalDate`) | date • nullable |
| `terms` | text • nullable |
| `status` | supplier_contract_status • not null • default "active" |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `supplier_directory_projections`
| Column | Type |
|--------|------|
| `supplier_id` (`supplierId`) | text • FK -> suppliers.id • not null |
| `email` | text • nullable |
| `phone` | text • nullable |
| `website` | text • nullable |
| `address` | text • nullable |
| `city` | text • nullable |
| `country` | text • nullable |
| `contact_name` (`contactName`) | text • nullable |
| `contact_email` (`contactEmail`) | text • nullable |
| `contact_phone` (`contactPhone`) | text • nullable |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `supplier_notes`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `supplier_id` (`supplierId`) | text • FK -> suppliers.id • not null |
| `author_id` (`authorId`) | text • not null |
| `content` | text • not null |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |

### `supplier_rates`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `service_id` (`serviceId`) | text • FK -> supplier_services.id • not null |
| `name` | text • not null |
| `currency` | text • not null |
| `amount_cents` (`amountCents`) | integer • not null |
| `unit` | rate_unit • not null |
| `valid_from` (`validFrom`) | date • nullable |
| `valid_to` (`validTo`) | date • nullable |
| `min_pax` (`minPax`) | integer • nullable |
| `max_pax` (`maxPax`) | integer • nullable |
| `notes` | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |

### `supplier_services`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `supplier_id` (`supplierId`) | text • FK -> suppliers.id • not null |
| `service_type` (`serviceType`) | service_type • not null |
| `facility_id` (`facilityId`) | text • nullable |
| `name` | text • not null |
| `description` | text • nullable |
| `duration` | text • nullable |
| `capacity` | integer • nullable |
| `active` | boolean • not null • default true |
| `tags` | jsonb • nullable • default [] |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `suppliers`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `name` | text • not null |
| `type` | supplier_type • not null |
| `status` | supplier_status • not null • default "active" |
| `description` | text • nullable |
| `default_currency` (`defaultCurrency`) | text • nullable |
| `payment_terms_days` (`paymentTermsDays`) | integer • nullable |
| `reservation_timeout_minutes` (`reservationTimeoutMinutes`) | integer • nullable |
| `primary_facility_id` (`primaryFacilityId`) | text • nullable |
| `customer_payment_policy` (`customerPaymentPolicy`) | jsonb • nullable |
| `tags` | jsonb • nullable • default [] |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

## Finance

### `booking_guarantees`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `booking_id` (`bookingId`) | text • not null |
| `booking_payment_schedule_id` (`bookingPaymentScheduleId`) | text • FK -> booking_payment_schedules.id • nullable |
| `booking_item_id` (`bookingItemId`) | text • nullable |
| `guarantee_type` (`guaranteeType`) | guarantee_type • not null |
| `status` | guarantee_status • not null • default "pending" |
| `payment_instrument_id` (`paymentInstrumentId`) | text • FK -> payment_instruments.id • nullable |
| `payment_authorization_id` (`paymentAuthorizationId`) | text • FK -> payment_authorizations.id • nullable |
| `currency` | text • nullable |
| `amount_cents` (`amountCents`) | integer • nullable |
| `provider` | text • nullable |
| `reference_number` (`referenceNumber`) | text • nullable |
| `guaranteed_at` (`guaranteedAt`) | timestamp with time zone • nullable |
| `expires_at` (`expiresAt`) | timestamp with time zone • nullable |
| `released_at` (`releasedAt`) | timestamp with time zone • nullable |
| `notes` | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `booking_item_commissions`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `booking_item_id` (`bookingItemId`) | text • not null |
| `channel_id` (`channelId`) | text • nullable |
| `recipient_type` (`recipientType`) | commission_recipient_type • not null |
| `commission_model` (`commissionModel`) | commission_model • not null • default "percentage" |
| `currency` | text • nullable |
| `amount_cents` (`amountCents`) | integer • nullable |
| `rate_basis_points` (`rateBasisPoints`) | integer • nullable |
| `status` | commission_status • not null • default "pending" |
| `payable_at` (`payableAt`) | date • nullable |
| `paid_at` (`paidAt`) | date • nullable |
| `notes` | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `booking_item_tax_lines`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `booking_item_id` (`bookingItemId`) | text • not null |
| `code` | text • nullable |
| `name` | text • not null |
| `jurisdiction` | text • nullable |
| `scope` | tax_scope • not null • default "excluded" |
| `currency` | text • not null |
| `amount_cents` (`amountCents`) | integer • not null |
| `rate_basis_points` (`rateBasisPoints`) | integer • nullable |
| `included_in_price` (`includedInPrice`) | boolean • not null • default false |
| `remittance_party` (`remittanceParty`) | text • nullable |
| `sort_order` (`sortOrder`) | integer • not null • default 0 |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `booking_payment_schedules`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `booking_id` (`bookingId`) | text • not null |
| `booking_item_id` (`bookingItemId`) | text • nullable |
| `schedule_type` (`scheduleType`) | payment_schedule_type • not null • default "balance" |
| `status` | payment_schedule_status • not null • default "pending" |
| `due_date` (`dueDate`) | date • not null |
| `currency` | text • not null |
| `amount_cents` (`amountCents`) | integer • not null |
| `notes` | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `cost_categories`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `name` | text • not null |
| `sort_order` (`sortOrder`) | integer • not null • default 0 |
| `archived_at` (`archivedAt`) | timestamp with time zone • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `credit_note_line_items`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `credit_note_id` (`creditNoteId`) | text • FK -> credit_notes.id • not null |
| `description` | text • not null |
| `quantity` | integer • not null • default 1 |
| `unit_price_cents` (`unitPriceCents`) | integer • not null |
| `total_cents` (`totalCents`) | integer • not null |
| `sort_order` (`sortOrder`) | integer • not null • default 0 |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |

### `credit_notes`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `credit_note_number` (`creditNoteNumber`) | text • unique • not null |
| `invoice_id` (`invoiceId`) | text • FK -> invoices.id • not null |
| `status` | credit_note_status • not null • default "draft" |
| `amount_cents` (`amountCents`) | integer • not null |
| `currency` | text • not null |
| `base_currency` (`baseCurrency`) | text • nullable |
| `base_amount_cents` (`baseAmountCents`) | integer • nullable |
| `fx_rate_set_id` (`fxRateSetId`) | text • nullable |
| `reason` | text • not null |
| `notes` | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `finance_notes`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `invoice_id` (`invoiceId`) | text • FK -> invoices.id • not null |
| `author_id` (`authorId`) | text • not null |
| `content` | text • not null |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |

### `invoice_attachments`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `invoice_id` (`invoiceId`) | text • FK -> invoices.id • not null |
| `kind` | text • not null • default "supporting_document" |
| `name` | text • not null |
| `mime_type` (`mimeType`) | text • nullable |
| `file_size` (`fileSize`) | integer • nullable |
| `storage_key` (`storageKey`) | text • nullable |
| `checksum` | text • nullable |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |

### `invoice_external_lifecycle_operations`
| Column | Type |
|--------|------|
| `invoice_id` (`invoiceId`) | text • PK • FK -> invoices.id • not null |
| `provider` | text • PK • not null |
| `operation_id` (`operationId`) | text • PK • not null |
| `state` | text • not null |
| `occurred_at` (`occurredAt`) | timestamp with time zone • not null |
| `successor_invoice_id` (`successorInvoiceId`) | text • FK -> invoices.id • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |

Constraints:
- Primary key: `invoice_id`, `provider`, `operation_id`

### `invoice_external_payment_identifiers`
| Column | Type |
|--------|------|
| `provider` | text • PK • not null |
| `payment_identifier` (`paymentIdentifier`) | text • PK • not null |
| `invoice_id` (`invoiceId`) | text • FK -> invoices.id • not null |
| `first_operation_id` (`firstOperationId`) | text • not null |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |

Constraints:
- Primary key: `provider`, `payment_identifier`

### `invoice_external_refs`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `invoice_id` (`invoiceId`) | text • FK -> invoices.id • not null |
| `provider` | text • not null |
| `external_id` (`externalId`) | text • nullable |
| `external_number` (`externalNumber`) | text • nullable |
| `external_url` (`externalUrl`) | text • nullable |
| `status` | text • nullable |
| `metadata` | jsonb • nullable |
| `synced_at` (`syncedAt`) | timestamp with time zone • nullable |
| `sync_error` (`syncError`) | text • nullable |
| `sync_state` (`syncState`) | text • nullable |
| `sync_operation_id` (`syncOperationId`) | text • nullable |
| `sync_occurred_at` (`syncOccurredAt`) | timestamp with time zone • nullable |
| `sync_error_code` (`syncErrorCode`) | text • nullable |
| `sync_error_message` (`syncErrorMessage`) | text • nullable |
| `sync_metadata` (`syncMetadata`) | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `invoice_external_settlement_observations`
| Column | Type |
|--------|------|
| `invoice_id` (`invoiceId`) | text • PK • FK -> invoices.id • not null |
| `provider` | text • PK • not null |
| `operation_id` (`operationId`) | text • PK • not null |
| `occurred_at` (`occurredAt`) | timestamp with time zone • not null |
| `status` | text • not null |
| `currency` | text • not null |
| `total_cents` (`totalCents`) | integer • not null |
| `paid_cents` (`paidCents`) | integer • not null |
| `balance_due_cents` (`balanceDueCents`) | integer • not null |
| `payment_identifiers` (`paymentIdentifiers`) | jsonb • not null |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |

Constraints:
- Primary key: `invoice_id`, `provider`, `operation_id`

### `invoice_external_sync_observations`
| Column | Type |
|--------|------|
| `invoice_id` (`invoiceId`) | text • PK • FK -> invoices.id • not null |
| `provider` | text • PK • not null |
| `operation_id` (`operationId`) | text • PK • not null |
| `status` | text • not null |
| `occurred_at` (`occurredAt`) | timestamp with time zone • not null |
| `error_code` (`errorCode`) | text • nullable |
| `error_message` (`errorMessage`) | text • nullable |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |

Constraints:
- Primary key: `invoice_id`, `provider`, `operation_id`

### `invoice_line_items`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `invoice_id` (`invoiceId`) | text • FK -> invoices.id • not null |
| `booking_item_id` (`bookingItemId`) | text • nullable |
| `booking_payment_schedule_id` (`bookingPaymentScheduleId`) | text • FK -> booking_payment_schedules.id • nullable |
| `description` | text • not null |
| `quantity` | integer • not null • default 1 |
| `unit_price_cents` (`unitPriceCents`) | integer • not null |
| `total_cents` (`totalCents`) | integer • not null |
| `tax_rate` (`taxRate`) | integer • nullable |
| `sort_order` (`sortOrder`) | integer • not null • default 0 |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |

### `invoice_number_series`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `code` | text • unique • not null |
| `name` | text • not null |
| `prefix` | text • not null • default "" |
| `separator` | text • not null • default "" |
| `pad_length` (`padLength`) | integer • not null • default 4 |
| `current_sequence` (`currentSequence`) | integer • not null • default 0 |
| `reset_strategy` (`resetStrategy`) | invoice_number_reset_strategy • not null • default "never" |
| `reset_at` (`resetAt`) | timestamp with time zone • nullable |
| `scope` | invoice_number_series_scope • not null • default "invoice" |
| `is_default` (`isDefault`) | boolean • not null • default false |
| `external_provider` (`externalProvider`) | text • nullable |
| `external_config_key` (`externalConfigKey`) | text • nullable |
| `active` | boolean • not null • default true |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `invoice_renditions`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `invoice_id` (`invoiceId`) | text • FK -> invoices.id • not null |
| `template_id` (`templateId`) | text • FK -> invoice_templates.id • nullable |
| `format` | invoice_rendition_format • not null • default "pdf" |
| `status` | invoice_rendition_status • not null • default "pending" |
| `storage_key` (`storageKey`) | text • nullable |
| `file_size` (`fileSize`) | integer • nullable |
| `checksum` | text • nullable |
| `language` | text • nullable |
| `error_message` (`errorMessage`) | text • nullable |
| `generated_at` (`generatedAt`) | timestamp with time zone • nullable |
| `app_provider` (`appProvider`) | text • nullable |
| `app_idempotency_digest` (`appIdempotencyDigest`) | text • nullable |
| `app_file_name` (`appFileName`) | text • nullable |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `invoice_templates`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `name` | text • not null |
| `slug` | text • unique • not null |
| `language` | text • not null • default "en" |
| `jurisdiction` | text • nullable |
| `body_format` (`bodyFormat`) | invoice_template_body_format • not null • default "html" |
| `body` | text • not null |
| `css_styles` (`cssStyles`) | text • nullable |
| `is_default` (`isDefault`) | boolean • not null • default false |
| `active` | boolean • not null • default true |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `invoices`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `invoice_number` (`invoiceNumber`) | text • not null |
| `invoice_type` (`invoiceType`) | invoice_type • not null • default "invoice" |
| `converted_from_invoice_id` (`convertedFromInvoiceId`) | text • nullable |
| `series_id` (`seriesId`) | text • nullable |
| `sequence` | integer • nullable |
| `template_id` (`templateId`) | text • nullable |
| `tax_regime_id` (`taxRegimeId`) | text • nullable |
| `language` | text • nullable |
| `booking_id` (`bookingId`) | text • not null |
| `person_id` (`personId`) | text • nullable |
| `organization_id` (`organizationId`) | text • nullable |
| `status` | invoice_status • not null • default "draft" |
| `currency` | text • not null |
| `base_currency` (`baseCurrency`) | text • nullable |
| `fx_rate_set_id` (`fxRateSetId`) | text • nullable |
| `subtotal_cents` (`subtotalCents`) | integer • not null • default 0 |
| `base_subtotal_cents` (`baseSubtotalCents`) | integer • nullable |
| `tax_cents` (`taxCents`) | integer • not null • default 0 |
| `base_tax_cents` (`baseTaxCents`) | integer • nullable |
| `total_cents` (`totalCents`) | integer • not null • default 0 |
| `base_total_cents` (`baseTotalCents`) | integer • nullable |
| `paid_cents` (`paidCents`) | integer • not null • default 0 |
| `base_paid_cents` (`basePaidCents`) | integer • nullable |
| `balance_due_cents` (`balanceDueCents`) | integer • not null • default 0 |
| `base_balance_due_cents` (`baseBalanceDueCents`) | integer • nullable |
| `commission_percent` (`commissionPercent`) | integer • nullable |
| `commission_amount_cents` (`commissionAmountCents`) | integer • nullable |
| `issue_date` (`issueDate`) | date • not null |
| `due_date` (`dueDate`) | date • not null |
| `notes` | text • nullable |
| `voided_at` (`voidedAt`) | timestamp with time zone • nullable |
| `void_reason` (`voidReason`) | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `payment_authorizations`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `booking_id` (`bookingId`) | text • nullable |
| `order_id` (`orderId`) | text • nullable |
| `invoice_id` (`invoiceId`) | text • FK -> invoices.id • nullable |
| `booking_guarantee_id` (`bookingGuaranteeId`) | text • nullable |
| `payment_instrument_id` (`paymentInstrumentId`) | text • FK -> payment_instruments.id • nullable |
| `status` | payment_authorization_status • not null • default "pending" |
| `capture_mode` (`captureMode`) | capture_mode • not null • default "manual" |
| `currency` | text • not null |
| `amount_cents` (`amountCents`) | integer • not null |
| `provider` | text • nullable |
| `external_authorization_id` (`externalAuthorizationId`) | text • nullable |
| `approval_code` (`approvalCode`) | text • nullable |
| `authorized_at` (`authorizedAt`) | timestamp with time zone • nullable |
| `expires_at` (`expiresAt`) | timestamp with time zone • nullable |
| `voided_at` (`voidedAt`) | timestamp with time zone • nullable |
| `notes` | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `payment_captures`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `payment_authorization_id` (`paymentAuthorizationId`) | text • FK -> payment_authorizations.id • nullable |
| `invoice_id` (`invoiceId`) | text • FK -> invoices.id • nullable |
| `status` | payment_capture_status • not null • default "pending" |
| `currency` | text • not null |
| `amount_cents` (`amountCents`) | integer • not null |
| `provider` | text • nullable |
| `external_capture_id` (`externalCaptureId`) | text • nullable |
| `captured_at` (`capturedAt`) | timestamp with time zone • nullable |
| `settled_at` (`settledAt`) | timestamp with time zone • nullable |
| `notes` | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `payment_instruments`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `owner_type` (`ownerType`) | payment_instrument_owner_type • not null • default "client" |
| `person_id` (`personId`) | text • nullable |
| `organization_id` (`organizationId`) | text • nullable |
| `supplier_id` (`supplierId`) | text • nullable |
| `channel_id` (`channelId`) | text • nullable |
| `instrument_type` (`instrumentType`) | payment_instrument_type • not null |
| `status` | payment_instrument_status • not null • default "active" |
| `label` | text • not null |
| `provider` | text • nullable |
| `brand` | text • nullable |
| `last4` | text • nullable |
| `holder_name` (`holderName`) | text • nullable |
| `expiry_month` (`expiryMonth`) | integer • nullable |
| `expiry_year` (`expiryYear`) | integer • nullable |
| `external_token` (`externalToken`) | text • nullable |
| `external_customer_id` (`externalCustomerId`) | text • nullable |
| `billing_email` (`billingEmail`) | text • nullable |
| `billing_address` (`billingAddress`) | text • nullable |
| `direct_bill_reference` (`directBillReference`) | text • nullable |
| `notes` | text • nullable |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `payment_sessions`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `target_type` (`targetType`) | payment_session_target_type • not null • default "other" |
| `target_id` (`targetId`) | text • nullable |
| `booking_id` (`bookingId`) | text • nullable |
| `order_id` (`orderId`) | text • nullable |
| `invoice_id` (`invoiceId`) | text • FK -> invoices.id • nullable |
| `booking_payment_schedule_id` (`bookingPaymentScheduleId`) | text • FK -> booking_payment_schedules.id • nullable |
| `booking_guarantee_id` (`bookingGuaranteeId`) | text • FK -> booking_guarantees.id • nullable |
| `payment_instrument_id` (`paymentInstrumentId`) | text • FK -> payment_instruments.id • nullable |
| `payment_authorization_id` (`paymentAuthorizationId`) | text • FK -> payment_authorizations.id • nullable |
| `payment_capture_id` (`paymentCaptureId`) | text • FK -> payment_captures.id • nullable |
| `payment_id` (`paymentId`) | text • FK -> payments.id • nullable |
| `status` | payment_session_status • not null • default "pending" |
| `provider` | text • nullable |
| `provider_connection_id` (`providerConnectionId`) | text • nullable |
| `provider_session_id` (`providerSessionId`) | text • nullable |
| `provider_payment_id` (`providerPaymentId`) | text • nullable |
| `external_reference` (`externalReference`) | text • nullable |
| `idempotency_key` (`idempotencyKey`) | text • nullable |
| `client_reference` (`clientReference`) | text • nullable |
| `currency` | text • not null |
| `amount_cents` (`amountCents`) | integer • not null |
| `payment_method` (`paymentMethod`) | payment_method • nullable |
| `payer_person_id` (`payerPersonId`) | text • nullable |
| `payer_organization_id` (`payerOrganizationId`) | text • nullable |
| `payer_email` (`payerEmail`) | text • nullable |
| `payer_name` (`payerName`) | text • nullable |
| `redirect_url` (`redirectUrl`) | text • nullable |
| `return_url` (`returnUrl`) | text • nullable |
| `cancel_url` (`cancelUrl`) | text • nullable |
| `callback_url` (`callbackUrl`) | text • nullable |
| `expires_at` (`expiresAt`) | timestamp with time zone • nullable |
| `completed_at` (`completedAt`) | timestamp with time zone • nullable |
| `failed_at` (`failedAt`) | timestamp with time zone • nullable |
| `cancelled_at` (`cancelledAt`) | timestamp with time zone • nullable |
| `expired_at` (`expiredAt`) | timestamp with time zone • nullable |
| `failure_code` (`failureCode`) | text • nullable |
| `failure_message` (`failureMessage`) | text • nullable |
| `notes` | text • nullable |
| `provider_payload` (`providerPayload`) | jsonb • nullable |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `payments`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `invoice_id` (`invoiceId`) | text • FK -> invoices.id • not null |
| `amount_cents` (`amountCents`) | integer • not null |
| `currency` | text • not null |
| `base_currency` (`baseCurrency`) | text • nullable |
| `base_amount_cents` (`baseAmountCents`) | integer • nullable |
| `fx_rate_set_id` (`fxRateSetId`) | text • nullable |
| `payment_method` (`paymentMethod`) | payment_method • not null |
| `payment_instrument_id` (`paymentInstrumentId`) | text • FK -> payment_instruments.id • nullable |
| `payment_authorization_id` (`paymentAuthorizationId`) | text • FK -> payment_authorizations.id • nullable |
| `payment_capture_id` (`paymentCaptureId`) | text • FK -> payment_captures.id • nullable |
| `status` | payment_status • not null • default "pending" |
| `reference_number` (`referenceNumber`) | text • nullable |
| `payment_date` (`paymentDate`) | date • not null |
| `notes` | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `supplier_cost_allocations`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `supplier_invoice_id` (`supplierInvoiceId`) | text • FK -> supplier_invoices.id • not null |
| `supplier_invoice_line_id` (`supplierInvoiceLineId`) | text • FK -> supplier_invoice_lines.id • nullable |
| `target_type` (`targetType`) | cost_allocation_target_type • not null |
| `departure_id` (`departureId`) | text • nullable |
| `product_id` (`productId`) | text • nullable |
| `booking_id` (`bookingId`) | text • nullable |
| `booking_item_id` (`bookingItemId`) | text • nullable |
| `traveler_id` (`travelerId`) | text • nullable |
| `amount_cents` (`amountCents`) | integer • not null |
| `base_amount_cents` (`baseAmountCents`) | integer • nullable |
| `split_method` (`splitMethod`) | cost_allocation_split_method • not null • default "manual" |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `supplier_invoice_attachments`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `supplier_invoice_id` (`supplierInvoiceId`) | text • FK -> supplier_invoices.id • not null |
| `kind` | text • not null • default "supporting_document" |
| `name` | text • not null |
| `mime_type` (`mimeType`) | text • nullable |
| `file_size` (`fileSize`) | integer • nullable |
| `storage_key` (`storageKey`) | text • nullable |
| `checksum` | text • nullable |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |

### `supplier_invoice_lines`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `supplier_invoice_id` (`supplierInvoiceId`) | text • FK -> supplier_invoices.id • not null |
| `description` | text • not null |
| `service_type` (`serviceType`) | ap_service_type • not null • default "other" |
| `cost_category_id` (`costCategoryId`) | text • FK -> cost_categories.id • nullable |
| `supplier_service_id` (`supplierServiceId`) | text • nullable |
| `quantity` | integer • not null • default 1 |
| `unit_amount_cents` (`unitAmountCents`) | integer • not null |
| `tax_rate_bps` (`taxRateBps`) | integer • nullable |
| `tax_amount_cents` (`taxAmountCents`) | integer • not null • default 0 |
| `total_amount_cents` (`totalAmountCents`) | integer • not null |
| `sort_order` (`sortOrder`) | integer • not null • default 0 |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `supplier_invoices`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `supplier_id` (`supplierId`) | text • not null |
| `supplier_invoice_no` (`supplierInvoiceNo`) | text • not null |
| `internal_ref` (`internalRef`) | text • nullable |
| `status` | supplier_invoice_status • not null • default "draft" |
| `currency` | text • not null |
| `base_currency` (`baseCurrency`) | text • nullable |
| `fx_rate_set_id` (`fxRateSetId`) | text • nullable |
| `subtotal_cents` (`subtotalCents`) | integer • not null • default 0 |
| `tax_cents` (`taxCents`) | integer • not null • default 0 |
| `total_cents` (`totalCents`) | integer • not null • default 0 |
| `base_subtotal_cents` (`baseSubtotalCents`) | integer • nullable |
| `base_tax_cents` (`baseTaxCents`) | integer • nullable |
| `base_total_cents` (`baseTotalCents`) | integer • nullable |
| `paid_cents` (`paidCents`) | integer • not null • default 0 |
| `balance_due_cents` (`balanceDueCents`) | integer • not null • default 0 |
| `tax_regime_id` (`taxRegimeId`) | text • nullable |
| `issue_date` (`issueDate`) | date • not null |
| `due_date` (`dueDate`) | date • nullable |
| `received_at` (`receivedAt`) | timestamp with time zone • nullable |
| `approved_at` (`approvedAt`) | timestamp with time zone • nullable |
| `approved_by` (`approvedBy`) | text • nullable |
| `storage_key` (`storageKey`) | text • nullable |
| `extraction_id` (`extractionId`) | text • nullable |
| `notes` | text • nullable |
| `voided_at` (`voidedAt`) | timestamp with time zone • nullable |
| `void_reason` (`voidReason`) | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |
| `deleted_at` (`deletedAt`) | timestamp with time zone • nullable |

### `supplier_payments`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `booking_id` (`bookingId`) | text • nullable |
| `supplier_id` (`supplierId`) | text • nullable |
| `booking_supplier_status_id` (`bookingSupplierStatusId`) | text • nullable |
| `supplier_invoice_id` (`supplierInvoiceId`) | text • FK -> supplier_invoices.id • nullable |
| `amount_cents` (`amountCents`) | integer • not null |
| `currency` | text • not null |
| `base_currency` (`baseCurrency`) | text • nullable |
| `base_amount_cents` (`baseAmountCents`) | integer • nullable |
| `fx_rate_set_id` (`fxRateSetId`) | text • nullable |
| `payment_method` (`paymentMethod`) | payment_method • not null |
| `payment_instrument_id` (`paymentInstrumentId`) | text • FK -> payment_instruments.id • nullable |
| `status` | payment_status • not null • default "pending" |
| `reference_number` (`referenceNumber`) | text • nullable |
| `payment_date` (`paymentDate`) | date • not null |
| `notes` | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `tax_classes`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `code` | text • not null |
| `label` | text • not null |
| `description` | text • nullable |
| `default_regime_id` (`defaultRegimeId`) | text • nullable |
| `lines` | jsonb • nullable |
| `active` | boolean • not null • default true |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `tax_policy_profiles`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `code` | text • not null |
| `name` | text • not null |
| `jurisdiction` | text • nullable |
| `description` | text • nullable |
| `active` | boolean • not null • default true |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `tax_policy_rules`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `profile_id` (`profileId`) | text • not null |
| `side` | tax_policy_side • not null • default "sell" |
| `priority` | integer • not null • default 100 |
| `name` | text • not null |
| `applies_to` (`appliesTo`) | tax_class_applies_to • not null • default "all" |
| `condition` | jsonb • nullable |
| `tax_regime_id` (`taxRegimeId`) | text • not null |
| `active` | boolean • not null • default true |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `tax_regimes`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `code` | tax_regime_code • not null |
| `name` | text • not null |
| `jurisdiction` | text • nullable |
| `rate_percent` (`ratePercent`) | integer • nullable |
| `description` | text • nullable |
| `legal_reference` (`legalReference`) | text • nullable |
| `active` | boolean • not null • default true |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `travel_credit_redemptions`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `travel_credit_id` (`travelCreditId`) | text • FK -> travel_credits.id • not null |
| `booking_id` (`bookingId`) | text • not null |
| `payment_id` (`paymentId`) | text • nullable |
| `idempotency_key` (`idempotencyKey`) | text • nullable |
| `amount_cents` (`amountCents`) | integer • not null |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `created_by_user_id` (`createdByUserId`) | text • nullable |

### `travel_credits`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `code` | text • not null |
| `series_code` (`seriesCode`) | text • nullable |
| `status` | travel_credit_status • not null • default "active" |
| `currency` | text • not null |
| `initial_amount_cents` (`initialAmountCents`) | integer • not null |
| `remaining_amount_cents` (`remainingAmountCents`) | integer • not null |
| `issued_to_person_id` (`issuedToPersonId`) | text • nullable |
| `issued_to_organization_id` (`issuedToOrganizationId`) | text • nullable |
| `source_type` (`sourceType`) | travel_credit_source_type • not null |
| `source_booking_id` (`sourceBookingId`) | text • nullable |
| `source_payment_id` (`sourcePaymentId`) | text • nullable |
| `valid_from` (`validFrom`) | timestamp with time zone • nullable |
| `expires_at` (`expiresAt`) | timestamp with time zone • nullable |
| `notes` | text • nullable |
| `issued_by_user_id` (`issuedByUserId`) | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

## Legal

### `contract_attachments`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `contract_id` (`contractId`) | text • FK -> contracts.id • not null |
| `kind` | text • not null • default "appendix" |
| `name` | text • not null |
| `mime_type` (`mimeType`) | text • nullable |
| `file_size` (`fileSize`) | integer • nullable |
| `storage_key` (`storageKey`) | text • nullable |
| `checksum` | text • nullable |
| `target_kind` (`targetKind`) | legal_target_kind • nullable |
| `target_id` (`targetId`) | text • nullable |
| `target_provider` (`targetProvider`) | text • nullable |
| `target_source_ref` (`targetSourceRef`) | text • nullable |
| `legacy_transaction_offer_id` (`legacyTransactionOfferId`) | text • nullable |
| `legacy_transaction_order_id` (`legacyTransactionOrderId`) | text • nullable |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |

### `contract_document_operations`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `booking_id` (`bookingId`) | text • not null |
| `contract_id` (`contractId`) | text • FK -> contracts.id • nullable |
| `organization_id` (`organizationId`) | text • nullable |
| `principal_type` (`principalType`) | text • not null |
| `principal_id` (`principalId`) | text • not null |
| `tenant_scope` (`tenantScope`) | text • not null |
| `claim_action_id` (`claimActionId`) | text • not null |
| `claim_action_name` (`claimActionName`) | text • not null |
| `claim_action_version` (`claimActionVersion`) | text • not null |
| `claim_target_type` (`claimTargetType`) | text • not null |
| `claim_target_id` (`claimTargetId`) | text • not null |
| `claim_idempotency_scope` (`claimIdempotencyScope`) | text • not null |
| `claim_idempotency_fingerprint` (`claimIdempotencyFingerprint`) | text • not null |
| `claim_command_payload` (`claimCommandPayload`) | jsonb • not null |
| `idempotency_key` (`idempotencyKey`) | text • not null |
| `mode` | text • not null |
| `request_fingerprint` (`requestFingerprint`) | text • not null |
| `target_fingerprint` (`targetFingerprint`) | text • not null |
| `provider_id` (`providerId`) | text • not null |
| `provider_version` (`providerVersion`) | text • not null |
| `provider_protocol` (`providerProtocol`) | text • not null |
| `status` | text • not null • default "prepared" |
| `checkpoint` | text • not null • default "prepared" |
| `attempt_count` (`attemptCount`) | integer • not null • default 0 |
| `max_attempts` (`maxAttempts`) | integer • not null • default 8 |
| `fencing_token` (`fencingToken`) | integer • not null • default 0 |
| `lease_owner` (`leaseOwner`) | text • nullable |
| `lease_expires_at` (`leaseExpiresAt`) | timestamp with time zone • nullable |
| `next_attempt_at` (`nextAttemptAt`) | timestamp with time zone • not null • default |
| `operation_key` (`operationKey`) | text • not null |
| `render_descriptor` (`renderDescriptor`) | jsonb • not null |
| `rendered_payload` (`renderedPayload`) | text • nullable |
| `artifact_metadata` (`artifactMetadata`) | jsonb • nullable |
| `artifact_name` (`artifactName`) | text • nullable |
| `artifact_content_type` (`artifactContentType`) | text • nullable |
| `artifact_checksum` (`artifactChecksum`) | text • nullable |
| `artifact_byte_length` (`artifactByteLength`) | integer • nullable |
| `previous_attachment_id` (`previousAttachmentId`) | text • nullable |
| `previous_storage_key` (`previousStorageKey`) | text • nullable |
| `previous_provider_id` (`previousProviderId`) | text • nullable |
| `previous_provider_version` (`previousProviderVersion`) | text • nullable |
| `previous_provider_protocol` (`previousProviderProtocol`) | text • nullable |
| `previous_canonical_fingerprint` (`previousCanonicalFingerprint`) | jsonb • nullable |
| `canonical_attachment_id` (`canonicalAttachmentId`) | text • nullable |
| `result` | jsonb • nullable |
| `event_id` (`eventId`) | text • not null |
| `last_error` (`lastError`) | text • nullable |
| `completed_at` (`completedAt`) | timestamp with time zone • nullable |
| `dead_lettered_at` (`deadLetteredAt`) | timestamp with time zone • nullable |
| `cleanup_completed_at` (`cleanupCompletedAt`) | timestamp with time zone • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `contract_lifecycle_command_results`
| Column | Type |
|--------|------|
| `claim_action_id` (`claimActionId`) | text • PK • not null |
| `action_name` (`actionName`) | text • not null |
| `action_version` (`actionVersion`) | text • not null |
| `target_type` (`targetType`) | text • not null |
| `contract_id` (`contractId`) | text • not null |
| `transition` | text • not null |
| `idempotency_scope` (`idempotencyScope`) | text • not null |
| `idempotency_key` (`idempotencyKey`) | text • not null |
| `idempotency_fingerprint` (`idempotencyFingerprint`) | text • not null |
| `principal_type` (`principalType`) | text • not null |
| `principal_id` (`principalId`) | text • not null |
| `organization_id` (`organizationId`) | text • nullable |
| `command_payload` (`commandPayload`) | jsonb • not null |
| `result` | jsonb • not null |
| `event_id` (`eventId`) | text • unique • not null |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |

### `contract_number_series`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `name` | text • not null |
| `prefix` | text • not null • default "" |
| `separator` | text • not null • default "" |
| `pad_length` (`padLength`) | integer • not null • default 4 |
| `current_sequence` (`currentSequence`) | integer • not null • default 0 |
| `reset_strategy` (`resetStrategy`) | contract_number_reset_strategy • not null • default "never" |
| `reset_at` (`resetAt`) | timestamp with time zone • nullable |
| `scope` | contract_scope • not null • default "customer" |
| `is_default` (`isDefault`) | boolean • not null • default false |
| `external_provider` (`externalProvider`) | text • nullable |
| `external_config_key` (`externalConfigKey`) | text • nullable |
| `active` | boolean • not null • default true |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `contract_signatures`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `contract_id` (`contractId`) | text • FK -> contracts.id • not null |
| `signer_name` (`signerName`) | text • not null |
| `signer_email` (`signerEmail`) | text • nullable |
| `signer_role` (`signerRole`) | text • nullable |
| `person_id` (`personId`) | text • nullable |
| `target_kind` (`targetKind`) | legal_target_kind • nullable |
| `target_id` (`targetId`) | text • nullable |
| `target_provider` (`targetProvider`) | text • nullable |
| `target_source_ref` (`targetSourceRef`) | text • nullable |
| `legacy_transaction_offer_id` (`legacyTransactionOfferId`) | text • nullable |
| `legacy_transaction_order_id` (`legacyTransactionOrderId`) | text • nullable |
| `method` | contract_signature_method • not null • default "manual" |
| `provider` | text • nullable |
| `external_reference` (`externalReference`) | text • nullable |
| `signature_data` (`signatureData`) | text • nullable |
| `ip_address` (`ipAddress`) | text • nullable |
| `user_agent` (`userAgent`) | text • nullable |
| `signed_at` (`signedAt`) | timestamp with time zone • not null • default |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |

### `contract_template_versions`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `template_id` (`templateId`) | text • FK -> contract_templates.id • not null |
| `version` | integer • not null |
| `body` | text • not null |
| `variable_schema` (`variableSchema`) | jsonb • nullable |
| `changelog` | text • nullable |
| `created_by` (`createdBy`) | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |

### `contract_templates`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `name` | text • not null |
| `slug` | text • unique • not null |
| `scope` | contract_scope • not null |
| `language` | text • not null • default "en" |
| `description` | text • nullable |
| `body` | text • not null |
| `variable_schema` (`variableSchema`) | jsonb • nullable |
| `current_version_id` (`currentVersionId`) | text • nullable |
| `channel_id` (`channelId`) | text • nullable |
| `is_default` (`isDefault`) | boolean • not null • default false |
| `active` | boolean • not null • default true |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `contracts`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `contract_number` (`contractNumber`) | text • unique • nullable |
| `scope` | contract_scope • not null |
| `status` | contract_status • not null • default "draft" |
| `stage_history` (`stageHistory`) | jsonb • not null • default |
| `title` | text • not null |
| `template_version_id` (`templateVersionId`) | text • FK -> contract_template_versions.id • nullable |
| `series_id` (`seriesId`) | text • FK -> contract_number_series.id • nullable |
| `person_id` (`personId`) | text • nullable |
| `organization_id` (`organizationId`) | text • nullable |
| `supplier_id` (`supplierId`) | text • nullable |
| `channel_id` (`channelId`) | text • nullable |
| `booking_id` (`bookingId`) | text • nullable |
| `target_kind` (`targetKind`) | legal_target_kind • nullable |
| `target_id` (`targetId`) | text • nullable |
| `target_provider` (`targetProvider`) | text • nullable |
| `target_source_ref` (`targetSourceRef`) | text • nullable |
| `legacy_transaction_offer_id` (`legacyTransactionOfferId`) | text • nullable |
| `legacy_transaction_order_id` (`legacyTransactionOrderId`) | text • nullable |
| `issued_at` (`issuedAt`) | timestamp with time zone • nullable |
| `sent_at` (`sentAt`) | timestamp with time zone • nullable |
| `executed_at` (`executedAt`) | timestamp with time zone • nullable |
| `expires_at` (`expiresAt`) | timestamp with time zone • nullable |
| `voided_at` (`voidedAt`) | timestamp with time zone • nullable |
| `language` | text • not null • default "en" |
| `rendered_body_format` (`renderedBodyFormat`) | contract_body_format • not null • default "html" |
| `rendered_body` (`renderedBody`) | text • nullable |
| `variables` | jsonb • nullable |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `policies`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `kind` | policy_kind • not null |
| `name` | text • not null |
| `slug` | text • unique • not null |
| `description` | text • nullable |
| `language` | text • not null • default "en" |
| `current_version_id` (`currentVersionId`) | text • nullable |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `policy_acceptances`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `policy_version_id` (`policyVersionId`) | text • FK -> policy_versions.id • not null |
| `person_id` (`personId`) | text • nullable |
| `booking_id` (`bookingId`) | text • nullable |
| `target_kind` (`targetKind`) | legal_target_kind • nullable |
| `target_id` (`targetId`) | text • nullable |
| `target_provider` (`targetProvider`) | text • nullable |
| `target_source_ref` (`targetSourceRef`) | text • nullable |
| `legacy_transaction_offer_id` (`legacyTransactionOfferId`) | text • nullable |
| `legacy_transaction_order_id` (`legacyTransactionOrderId`) | text • nullable |
| `accepted_at` (`acceptedAt`) | timestamp with time zone • not null • default |
| `accepted_by` (`acceptedBy`) | text • nullable |
| `method` | policy_acceptance_method • not null • default "implicit" |
| `ip_address` (`ipAddress`) | text • nullable |
| `user_agent` (`userAgent`) | text • nullable |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |

### `policy_assignments`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `policy_id` (`policyId`) | text • FK -> policies.id • not null |
| `scope` | policy_assignment_scope • not null |
| `product_id` (`productId`) | text • nullable |
| `channel_id` (`channelId`) | text • nullable |
| `supplier_id` (`supplierId`) | text • nullable |
| `market_id` (`marketId`) | text • nullable |
| `organization_id` (`organizationId`) | text • nullable |
| `valid_from` (`validFrom`) | date • nullable |
| `valid_to` (`validTo`) | date • nullable |
| `priority` | integer • not null • default 0 |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `policy_rules`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `policy_version_id` (`policyVersionId`) | text • FK -> policy_versions.id • not null |
| `rule_type` (`ruleType`) | policy_rule_type • not null |
| `label` | text • nullable |
| `days_before_departure` (`daysBeforeDeparture`) | integer • nullable |
| `refund_percent` (`refundPercent`) | integer • nullable |
| `refund_type` (`refundType`) | policy_refund_type • nullable |
| `flat_amount_cents` (`flatAmountCents`) | integer • nullable |
| `currency` | text • nullable |
| `valid_from` (`validFrom`) | date • nullable |
| `valid_to` (`validTo`) | date • nullable |
| `conditions` | jsonb • nullable |
| `sort_order` (`sortOrder`) | integer • not null • default 0 |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `policy_versions`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `policy_id` (`policyId`) | text • FK -> policies.id • not null |
| `version` | integer • not null |
| `status` | policy_version_status • not null • default "draft" |
| `title` | text • not null |
| `body` | text • nullable |
| `published_at` (`publishedAt`) | timestamp with time zone • nullable |
| `published_by` (`publishedBy`) | text • nullable |
| `retired_at` (`retiredAt`) | timestamp with time zone • nullable |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

## Notifications & Verification

### `notification_deliveries`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `template_id` (`templateId`) | text • FK -> notification_templates.id • nullable |
| `template_slug` (`templateSlug`) | text • nullable |
| `target_type` (`targetType`) | notification_target_type • not null • default "other" |
| `target_id` (`targetId`) | text • nullable |
| `person_id` (`personId`) | text • nullable |
| `organization_id` (`organizationId`) | text • nullable |
| `booking_id` (`bookingId`) | text • nullable |
| `invoice_id` (`invoiceId`) | text • nullable |
| `payment_session_id` (`paymentSessionId`) | text • nullable |
| `channel` | notification_channel • not null |
| `provider` | text • not null |
| `provider_message_id` (`providerMessageId`) | text • nullable |
| `status` | notification_delivery_status • not null • default "pending" |
| `to_address` (`toAddress`) | text • not null |
| `from_address` (`fromAddress`) | text • nullable |
| `subject` | text • nullable |
| `html_body` (`htmlBody`) | text • nullable |
| `text_body` (`textBody`) | text • nullable |
| `payload_data` (`payloadData`) | jsonb • nullable |
| `metadata` | jsonb • nullable |
| `error_message` (`errorMessage`) | text • nullable |
| `scheduled_for` (`scheduledFor`) | timestamp with time zone • nullable |
| `sent_at` (`sentAt`) | timestamp with time zone • nullable |
| `failed_at` (`failedAt`) | timestamp with time zone • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `notification_reminder_rule_authoring_requests`
| Column | Type |
|--------|------|
| `idempotency_key` (`idempotencyKey`) | text • PK • not null |
| `reminder_rule_id` (`reminderRuleId`) | text • FK -> notification_reminder_rules.id • not null |
| `operation` | text • not null |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |

### `notification_reminder_rule_stages`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `reminder_rule_id` (`reminderRuleId`) | text • FK -> notification_reminder_rules.id • not null |
| `order_index` (`orderIndex`) | integer • not null |
| `name` | text • nullable |
| `anchor` | notification_reminder_stage_anchor • not null |
| `window_start_days` (`windowStartDays`) | integer • not null |
| `window_end_days` (`windowEndDays`) | integer • not null |
| `cadence_kind` (`cadenceKind`) | notification_reminder_stage_cadence_kind • not null |
| `cadence_every_days` (`cadenceEveryDays`) | integer • nullable |
| `cadence_intervals` (`cadenceIntervals`) | jsonb • nullable |
| `max_sends_in_stage` (`maxSendsInStage`) | integer • nullable |
| `respect_quiet_hours` (`respectQuietHours`) | boolean • not null • default true |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `notification_reminder_rules`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `slug` | text • unique • not null |
| `name` | text • not null |
| `status` | notification_reminder_status • not null • default "draft" |
| `target_type` (`targetType`) | notification_reminder_target_type • not null |
| `channel` | notification_channel • not null |
| `provider` | text • nullable |
| `template_id` (`templateId`) | text • FK -> notification_templates.id • nullable |
| `template_slug` (`templateSlug`) | text • nullable |
| `priority` | integer • not null • default 0 |
| `suppression_group` (`suppressionGroup`) | text • nullable |
| `is_system` (`isSystem`) | boolean • not null • default false |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `notification_reminder_runs`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `reminder_rule_id` (`reminderRuleId`) | text • FK -> notification_reminder_rules.id • not null |
| `target_type` (`targetType`) | notification_reminder_target_type • not null |
| `target_id` (`targetId`) | text • not null |
| `dedupe_key` (`dedupeKey`) | text • unique • not null |
| `booking_id` (`bookingId`) | text • nullable |
| `person_id` (`personId`) | text • nullable |
| `organization_id` (`organizationId`) | text • nullable |
| `payment_session_id` (`paymentSessionId`) | text • nullable |
| `notification_delivery_id` (`notificationDeliveryId`) | text • FK -> notification_deliveries.id • nullable |
| `status` | notification_reminder_run_status • not null |
| `recipient` | text • nullable |
| `scheduled_for` (`scheduledFor`) | timestamp with time zone • not null |
| `processed_at` (`processedAt`) | timestamp with time zone • not null • default |
| `error_message` (`errorMessage`) | text • nullable |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `notification_reminder_stage_channels`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `stage_id` (`stageId`) | text • FK -> notification_reminder_rule_stages.id • not null |
| `order_index` (`orderIndex`) | integer • not null • default 0 |
| `channel` | notification_channel • not null |
| `provider` | text • nullable |
| `template_id` (`templateId`) | text • FK -> notification_templates.id • nullable |
| `template_slug` (`templateSlug`) | text • nullable |
| `recipient_kind` (`recipientKind`) | notification_stage_recipient_kind • not null • default "primary" |
| `recipient_role` (`recipientRole`) | text • nullable |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `notification_send_operations`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `command_scope` (`commandScope`) | text • not null |
| `idempotency_key` (`idempotencyKey`) | text • not null |
| `request_fingerprint` (`requestFingerprint`) | text • not null |
| `claim_action_id` (`claimActionId`) | text • unique • not null |
| `organization_id` (`organizationId`) | text • nullable |
| `target_type` (`targetType`) | text • not null |
| `target_id` (`targetId`) | text • not null |
| `delivery_id` (`deliveryId`) | text • FK -> notification_deliveries.id • not null |
| `provider` | text • not null |
| `provider_idempotency_key` (`providerIdempotencyKey`) | text • not null |
| `request_payload` (`requestPayload`) | jsonb • not null |
| `result_snapshot` (`resultSnapshot`) | jsonb • not null |
| `terminal_event` (`terminalEvent`) | jsonb • nullable |
| `status` | notification_send_operation_status • not null • default "pending" |
| `attempts` | integer • not null • default 0 |
| `max_attempts` (`maxAttempts`) | integer • not null • default 8 |
| `next_attempt_at` (`nextAttemptAt`) | timestamp with time zone • not null • default |
| `lease_expires_at` (`leaseExpiresAt`) | timestamp with time zone • nullable |
| `last_error` (`lastError`) | text • nullable |
| `completed_at` (`completedAt`) | timestamp with time zone • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `notification_settings`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `scope` | text • not null • default "default" |
| `quiet_hours_local` (`quietHoursLocal`) | jsonb • nullable |
| `blackout_dates` (`blackoutDates`) | jsonb • nullable |
| `skip_weekends` (`skipWeekends`) | boolean • not null • default false |
| `recipient_rate_limit_per_day` (`recipientRateLimitPerDay`) | integer • nullable |
| `suppression_window_hours` (`suppressionWindowHours`) | integer • not null • default 24 |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `notification_templates`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `slug` | text • unique • not null |
| `name` | text • not null |
| `channel` | notification_channel • not null |
| `provider` | text • nullable |
| `status` | notification_template_status • not null • default "draft" |
| `subject_template` (`subjectTemplate`) | text • nullable |
| `html_template` (`htmlTemplate`) | text • nullable |
| `text_template` (`textTemplate`) | text • nullable |
| `from_address` (`fromAddress`) | text • nullable |
| `is_system` (`isSystem`) | boolean • not null • default false |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `storefront_verification_challenges`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `channel` | storefront_verification_channel • not null |
| `destination` | text • not null |
| `purpose` | text • not null • default "contact_confirmation" |
| `code_hash` (`codeHash`) | text • not null |
| `status` | storefront_verification_status • not null • default "pending" |
| `attempt_count` (`attemptCount`) | integer • not null • default 0 |
| `max_attempts` (`maxAttempts`) | integer • not null • default 5 |
| `expires_at` (`expiresAt`) | timestamp with time zone • not null |
| `last_sent_at` (`lastSentAt`) | timestamp with time zone • not null • default |
| `verified_at` (`verifiedAt`) | timestamp with time zone • nullable |
| `failed_at` (`failedAt`) | timestamp with time zone • nullable |
| `subject_ref` (`subjectRef`) | text • nullable |
| `consumed_at` (`consumedAt`) | timestamp with time zone • nullable |
| `consumed_ref` (`consumedRef`) | text • nullable |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

## Accommodations

### `accommodations_sourced_content`
| Column | Type |
|--------|------|
| `entity_id` | text • PK • not null |
| `locale` | text • PK • not null |
| `market` | text • PK • not null • default "*" |
| `payload` | jsonb • not null |
| `content_schema_version` | text • not null |
| `returned_locale` | text • not null |
| `machine_translated` | boolean • not null • default false |
| `source_updated_at` | timestamp with time zone • nullable |
| `fetched_at` | timestamp with time zone • not null • default |
| `fresh_until` | timestamp with time zone • nullable |
| `etag` | text • nullable |
| `fetch_status` | text • not null • default "ok" |
| `fetch_error` | text • nullable |

Constraints:
- Primary key: `entity_id`, `locale`, `market`

### `meal_plans`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `property_id` (`propertyId`) | text • not null |
| `code` | text • not null |
| `name` | text • not null |
| `description` | text • nullable |
| `includes_breakfast` (`includesBreakfast`) | boolean • not null • default false |
| `includes_lunch` (`includesLunch`) | boolean • not null • default false |
| `includes_dinner` (`includesDinner`) | boolean • not null • default false |
| `includes_drinks` (`includesDrinks`) | boolean • not null • default false |
| `active` | boolean • not null • default true |
| `sort_order` (`sortOrder`) | integer • not null • default 0 |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `rate_plan_daily_rates`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `rate_plan_id` (`ratePlanId`) | text • FK -> rate_plans.id • not null |
| `room_type_id` (`roomTypeId`) | text • FK -> room_types.id • not null |
| `date` | date • not null |
| `sell_currency` (`sellCurrency`) | text • not null |
| `sell_amount_cents` (`sellAmountCents`) | integer • not null |
| `cost_currency` (`costCurrency`) | text • nullable |
| `cost_amount_cents` (`costAmountCents`) | integer • nullable |
| `tax_amount_cents` (`taxAmountCents`) | integer • nullable |
| `fee_amount_cents` (`feeAmountCents`) | integer • nullable |
| `occupancy_basis` (`occupancyBasis`) | text • not null • default "room" |
| `included_adults` (`includedAdults`) | integer • not null • default 2 |
| `included_children` (`includedChildren`) | integer • not null • default 0 |
| `included_infants` (`includedInfants`) | integer • not null • default 0 |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `rate_plan_room_types`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `rate_plan_id` (`ratePlanId`) | text • FK -> rate_plans.id • not null |
| `room_type_id` (`roomTypeId`) | text • FK -> room_types.id • not null |
| `product_id` (`productId`) | text • nullable |
| `option_id` (`optionId`) | text • nullable |
| `unit_id` (`unitId`) | text • nullable |
| `active` | boolean • not null • default true |
| `sort_order` (`sortOrder`) | integer • not null • default 0 |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `rate_plans`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `property_id` (`propertyId`) | text • not null |
| `code` | text • not null |
| `name` | text • not null |
| `description` | text • nullable |
| `meal_plan_id` (`mealPlanId`) | text • FK -> meal_plans.id • nullable |
| `price_catalog_id` (`priceCatalogId`) | text • nullable |
| `cancellation_policy_id` (`cancellationPolicyId`) | text • nullable |
| `market_id` (`marketId`) | text • nullable |
| `currency_code` (`currencyCode`) | text • not null |
| `charge_frequency` (`chargeFrequency`) | rate_plan_charge_frequency • not null • default "per_night" |
| `guarantee_mode` (`guaranteeMode`) | accommodation_guarantee_mode • not null • default "none" |
| `commissionable` | boolean • not null • default true |
| `refundable` | boolean • not null • default true |
| `active` | boolean • not null • default true |
| `sort_order` (`sortOrder`) | integer • not null • default 0 |
| `customer_payment_policy` (`customerPaymentPolicy`) | jsonb • nullable |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `room_block_nights`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `block_id` (`blockId`) | text • FK -> room_blocks.id • not null |
| `date` | date • not null |
| `rooms_held` (`roomsHeld`) | integer • not null • default 0 |
| `rooms_picked_up` (`roomsPickedUp`) | integer • not null • default 0 |
| `rooms_released` (`roomsReleased`) | integer • not null • default 0 |
| `net_rate_cents_override` (`netRateCentsOverride`) | integer • nullable |
| `sell_rate_cents_override` (`sellRateCentsOverride`) | integer • nullable |

### `room_block_pickups`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `block_id` (`blockId`) | text • FK -> room_blocks.id • not null |
| `booking_id` (`bookingId`) | text • nullable |
| `stay_booking_item_id` (`stayBookingItemId`) | text • FK -> stay_booking_items.id • nullable |
| `check_in` (`checkIn`) | date • not null |
| `check_out` (`checkOut`) | date • not null |
| `rooms` | integer • not null • default 1 |
| `status` | room_block_pickup_status • not null • default "active" |
| `picked_up_at` (`pickedUpAt`) | timestamp with time zone • not null • default |
| `reversed_at` (`reversedAt`) | timestamp with time zone • nullable |

### `room_blocks`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `program_id` (`programId`) | text • nullable |
| `supplier_id` (`supplierId`) | text • nullable |
| `property_id` (`propertyId`) | text • nullable |
| `room_type_id` (`roomTypeId`) | text • FK -> room_types.id • not null |
| `name` | text • not null |
| `status` | hotel_room_block_status • not null • default "inquiry" |
| `currency` | text • not null |
| `net_rate_cents` (`netRateCents`) | integer • nullable |
| `sell_rate_cents` (`sellRateCents`) | integer • nullable |
| `option_date` (`optionDate`) | date • nullable |
| `cutoff_date` (`cutoffDate`) | date • nullable |
| `attrition_terms` (`attritionTerms`) | jsonb • nullable |
| `deposit_terms` (`depositTerms`) | jsonb • nullable |
| `notes` | text • nullable |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `room_type_bed_configs`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `room_type_id` (`roomTypeId`) | text • FK -> room_types.id • not null |
| `bed_type` (`bedType`) | text • not null |
| `quantity` | integer • not null • default 1 |
| `is_primary` (`isPrimary`) | boolean • not null • default false |
| `notes` | text • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `room_type_daily_inventory`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `room_type_id` (`roomTypeId`) | text • FK -> room_types.id • not null |
| `date` | date • not null |
| `capacity` | integer • not null • default 0 |
| `closed` | boolean • not null • default false |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `room_types`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `property_id` (`propertyId`) | text • not null |
| `supplier_id` (`supplierId`) | text • nullable |
| `code` | text • nullable |
| `name` | text • not null |
| `description` | text • nullable |
| `inventory_mode` (`inventoryMode`) | accommodation_inventory_mode • not null • default "pooled" |
| `room_class` (`roomClass`) | text • nullable |
| `max_adults` (`maxAdults`) | integer • nullable |
| `max_children` (`maxChildren`) | integer • nullable |
| `max_infants` (`maxInfants`) | integer • nullable |
| `standard_occupancy` (`standardOccupancy`) | integer • nullable |
| `max_occupancy` (`maxOccupancy`) | integer • nullable |
| `min_occupancy` (`minOccupancy`) | integer • nullable |
| `bedroom_count` (`bedroomCount`) | integer • nullable |
| `bathroom_count` (`bathroomCount`) | integer • nullable |
| `area_value` (`areaValue`) | integer • nullable |
| `area_unit` (`areaUnit`) | text • nullable |
| `accessibility_notes` (`accessibilityNotes`) | text • nullable |
| `smoking_allowed` (`smokingAllowed`) | boolean • not null • default false |
| `active` | boolean • not null • default true |
| `sort_order` (`sortOrder`) | integer • not null • default 0 |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `stay_booking_items`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `booking_item_id` (`bookingItemId`) | text • FK -> booking_items.id • not null |
| `property_id` (`propertyId`) | text • not null |
| `room_type_id` (`roomTypeId`) | text • FK -> room_types.id • not null |
| `supplier_room_ref` (`supplierRoomRef`) | text • nullable |
| `rate_plan_id` (`ratePlanId`) | text • FK -> rate_plans.id • not null |
| `check_in_date` (`checkInDate`) | date • not null |
| `check_out_date` (`checkOutDate`) | date • not null |
| `night_count` (`nightCount`) | integer • not null • default 1 |
| `room_count` (`roomCount`) | integer • not null • default 1 |
| `adults` | integer • not null • default 1 |
| `children` | integer • not null • default 0 |
| `infants` | integer • not null • default 0 |
| `meal_plan_id` (`mealPlanId`) | text • FK -> meal_plans.id • nullable |
| `confirmation_code` (`confirmationCode`) | text • nullable |
| `voucher_code` (`voucherCode`) | text • nullable |
| `status` | stay_booking_item_status • not null • default "reserved" |
| `notes` | text • nullable |
| `metadata` | jsonb • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |

### `stay_daily_rates`
| Column | Type |
|--------|------|
| `id` | text • PK • not null • default |
| `stay_booking_item_id` (`stayBookingItemId`) | text • FK -> stay_booking_items.id • not null |
| `date` | date • not null |
| `sell_currency` (`sellCurrency`) | text • not null |
| `sell_amount_cents` (`sellAmountCents`) | integer • nullable |
| `cost_currency` (`costCurrency`) | text • nullable |
| `cost_amount_cents` (`costAmountCents`) | integer • nullable |
| `tax_amount_cents` (`taxAmountCents`) | integer • nullable |
| `fee_amount_cents` (`feeAmountCents`) | integer • nullable |
| `commission_amount_cents` (`commissionAmountCents`) | integer • nullable |
| `created_at` (`createdAt`) | timestamp with time zone • not null • default |
| `updated_at` (`updatedAt`) | timestamp with time zone • not null • default |
