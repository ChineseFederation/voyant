CREATE EXTENSION IF NOT EXISTS "pg_trgm";
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS "unaccent";
--> statement-breakpoint
CREATE TYPE "public"."roles" AS ENUM('super-admin', 'admin', 'editor', 'viewer', 'member', 'guest');--> statement-breakpoint
CREATE TYPE "public"."seating_preference" AS ENUM('aisle', 'window', 'middle', 'no_preference');--> statement-breakpoint
CREATE TYPE "public"."domain_provider" AS ENUM('cloudflare');--> statement-breakpoint
CREATE TYPE "public"."domain_status" AS ENUM('pending', 'verified', 'active', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."email_provider" AS ENUM('resend', 'ses');--> statement-breakpoint
CREATE TYPE "public"."resend_region" AS ENUM('us-east-1', 'eu-west-1', 'sa-east-1', 'ap-northeast-1');--> statement-breakpoint
CREATE TYPE "public"."tls_mode" AS ENUM('opportunistic', 'enforced');--> statement-breakpoint
CREATE TYPE "public"."action_ledger_action_kind" AS ENUM('read', 'create', 'update', 'delete', 'execute', 'approve', 'reject', 'reverse', 'compensate', 'duplicate');--> statement-breakpoint
CREATE TYPE "public"."action_ledger_approval_status" AS ENUM('pending', 'approved', 'denied', 'expired', 'cancelled', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."action_ledger_principal_type" AS ENUM('user', 'api_key', 'agent', 'workflow', 'system');--> statement-breakpoint
CREATE TYPE "public"."action_ledger_redaction_status" AS ENUM('none', 'redacted', 'tombstoned', 'crypto_shredded');--> statement-breakpoint
CREATE TYPE "public"."action_ledger_relay_status" AS ENUM('pending', 'processing', 'succeeded', 'failed', 'dead_letter');--> statement-breakpoint
CREATE TYPE "public"."action_ledger_reversal_kind" AS ENUM('none', 'revert', 'compensate', 'domain_command');--> statement-breakpoint
CREATE TYPE "public"."action_ledger_reversal_outcome" AS ENUM('full', 'partial', 'failed');--> statement-breakpoint
CREATE TYPE "public"."action_ledger_reversal_state" AS ENUM('not_reversible', 'available', 'requested', 'running', 'completed', 'failed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."action_ledger_risk" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."action_ledger_status" AS ENUM('requested', 'awaiting_approval', 'approved', 'denied', 'succeeded', 'failed', 'reversed', 'compensated', 'expired', 'cancelled', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."person_document_type" AS ENUM('passport', 'id_card', 'driver_license', 'visa', 'other');--> statement-breakpoint
CREATE TYPE "public"."person_relationship_kind" AS ENUM('spouse', 'partner', 'parent', 'child', 'sibling', 'guardian', 'ward', 'emergency_contact', 'friend', 'travel_companion', 'other');--> statement-breakpoint
CREATE TYPE "public"."activity_link_role" AS ENUM('primary', 'related');--> statement-breakpoint
CREATE TYPE "public"."activity_status" AS ENUM('planned', 'done', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."activity_type" AS ENUM('call', 'email', 'meeting', 'task', 'follow_up', 'note');--> statement-breakpoint
CREATE TYPE "public"."communication_channel" AS ENUM('email', 'phone', 'whatsapp', 'sms', 'meeting', 'other');--> statement-breakpoint
CREATE TYPE "public"."communication_direction" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TYPE "public"."custom_field_type" AS ENUM('varchar', 'text', 'double', 'monetary', 'date', 'boolean', 'enum', 'set', 'json', 'address', 'phone');--> statement-breakpoint
CREATE TYPE "public"."entity_type" AS ENUM('organization', 'person', 'proposal', 'activity');--> statement-breakpoint
CREATE TYPE "public"."record_status" AS ENUM('active', 'inactive', 'archived');--> statement-breakpoint
CREATE TYPE "public"."relation_type" AS ENUM('client', 'partner', 'supplier', 'other');--> statement-breakpoint
CREATE TYPE "public"."customer_signal_kind" AS ENUM('wishlist', 'notify', 'inquiry', 'request_offer', 'referral');--> statement-breakpoint
CREATE TYPE "public"."customer_signal_source" AS ENUM('form', 'phone', 'admin', 'abandoned_cart', 'website', 'booking');--> statement-breakpoint
CREATE TYPE "public"."customer_signal_status" AS ENUM('new', 'contacted', 'qualified', 'converted', 'lost', 'expired');--> statement-breakpoint
CREATE TYPE "public"."participant_role" AS ENUM('traveler', 'booker', 'decision_maker', 'finance', 'other');--> statement-breakpoint
CREATE TYPE "public"."proposal_status" AS ENUM('open', 'won', 'lost', 'archived');--> statement-breakpoint
CREATE TYPE "public"."proposal_version_status" AS ENUM('draft', 'sent', 'accepted', 'declined', 'superseded', 'expired');--> statement-breakpoint
CREATE TYPE "public"."address_label" AS ENUM('primary', 'billing', 'shipping', 'mailing', 'meeting', 'service', 'legal', 'other');--> statement-breakpoint
CREATE TYPE "public"."contact_point_kind" AS ENUM('email', 'phone', 'mobile', 'whatsapp', 'website', 'sms', 'fax', 'social', 'other');--> statement-breakpoint
CREATE TYPE "public"."named_contact_role" AS ENUM('general', 'primary', 'reservations', 'operations', 'front_desk', 'sales', 'emergency', 'accounting', 'legal', 'other');--> statement-breakpoint
CREATE TYPE "public"."booking_dist_payment_owner" AS ENUM('operator', 'channel', 'split');--> statement-breakpoint
CREATE TYPE "public"."external_ref_status" AS ENUM('active', 'inactive', 'archived');--> statement-breakpoint
CREATE TYPE "public"."channel_allotment_release_mode" AS ENUM('automatic', 'manual');--> statement-breakpoint
CREATE TYPE "public"."channel_allotment_unsold_action" AS ENUM('release_to_general_pool', 'expire', 'retain');--> statement-breakpoint
CREATE TYPE "public"."channel_commission_scope" AS ENUM('booking', 'product', 'rate', 'category');--> statement-breakpoint
CREATE TYPE "public"."channel_commission_type" AS ENUM('fixed', 'percentage');--> statement-breakpoint
CREATE TYPE "public"."channel_contract_status" AS ENUM('draft', 'active', 'expired', 'terminated');--> statement-breakpoint
CREATE TYPE "public"."channel_kind" AS ENUM('direct', 'affiliate', 'ota', 'reseller', 'marketplace', 'api_partner', 'connect');--> statement-breakpoint
CREATE TYPE "public"."channel_reconciliation_issue_type" AS ENUM('missing_booking', 'status_mismatch', 'amount_mismatch', 'cancel_mismatch', 'missing_payout', 'other');--> statement-breakpoint
CREATE TYPE "public"."channel_reconciliation_policy_frequency" AS ENUM('manual', 'daily', 'weekly', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."channel_reconciliation_resolution_status" AS ENUM('open', 'ignored', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."channel_reconciliation_run_status" AS ENUM('draft', 'running', 'completed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."channel_reconciliation_severity" AS ENUM('info', 'warning', 'error');--> statement-breakpoint
CREATE TYPE "public"."channel_release_execution_action" AS ENUM('released', 'expired', 'retained', 'manual_override');--> statement-breakpoint
CREATE TYPE "public"."channel_release_execution_status" AS ENUM('pending', 'completed', 'skipped', 'failed');--> statement-breakpoint
CREATE TYPE "public"."channel_release_schedule_kind" AS ENUM('manual', 'hourly', 'daily');--> statement-breakpoint
CREATE TYPE "public"."channel_remittance_exception_status" AS ENUM('open', 'investigating', 'resolved', 'ignored');--> statement-breakpoint
CREATE TYPE "public"."channel_settlement_approval_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."channel_settlement_item_status" AS ENUM('pending', 'approved', 'disputed', 'paid', 'void');--> statement-breakpoint
CREATE TYPE "public"."channel_settlement_policy_frequency" AS ENUM('manual', 'daily', 'weekly', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."channel_settlement_run_status" AS ENUM('draft', 'open', 'posted', 'paid', 'void');--> statement-breakpoint
CREATE TYPE "public"."channel_status" AS ENUM('active', 'inactive', 'pending', 'archived');--> statement-breakpoint
CREATE TYPE "public"."channel_webhook_status" AS ENUM('pending', 'processed', 'failed', 'ignored');--> statement-breakpoint
CREATE TYPE "public"."distribution_cancellation_owner" AS ENUM('operator', 'channel', 'mixed');--> statement-breakpoint
CREATE TYPE "public"."distribution_payment_owner" AS ENUM('operator', 'channel', 'split');--> statement-breakpoint
CREATE TYPE "public"."rate_unit" AS ENUM('per_person', 'per_group', 'per_night', 'per_vehicle', 'flat');--> statement-breakpoint
CREATE TYPE "public"."service_type" AS ENUM('accommodation', 'transfer', 'experience', 'guide', 'meal', 'other');--> statement-breakpoint
CREATE TYPE "public"."supplier_contract_status" AS ENUM('active', 'expired', 'pending', 'terminated');--> statement-breakpoint
CREATE TYPE "public"."supplier_status" AS ENUM('active', 'inactive', 'pending');--> statement-breakpoint
CREATE TYPE "public"."supplier_type" AS ENUM('hotel', 'transfer', 'guide', 'experience', 'airline', 'restaurant', 'other');--> statement-breakpoint
CREATE TYPE "public"."extra_collection_mode" AS ENUM('booking_total', 'cash_on_trip', 'external', 'included', 'none');--> statement-breakpoint
CREATE TYPE "public"."extra_pricing_mode" AS ENUM('included', 'per_person', 'per_booking', 'quantity_based', 'on_request', 'free');--> statement-breakpoint
CREATE TYPE "public"."extra_selection_type" AS ENUM('optional', 'required', 'default_selected', 'unavailable');--> statement-breakpoint
CREATE TYPE "public"."option_unit_type" AS ENUM('person', 'group', 'room', 'vehicle', 'service', 'other');--> statement-breakpoint
CREATE TYPE "public"."product_activation_mode" AS ENUM('manual', 'scheduled', 'channel_controlled');--> statement-breakpoint
CREATE TYPE "public"."product_booking_mode" AS ENUM('date', 'date_time', 'open', 'stay', 'transfer', 'itinerary', 'other');--> statement-breakpoint
CREATE TYPE "public"."product_capability" AS ENUM('instant_confirmation', 'on_request', 'pickup_available', 'dropoff_available', 'guided', 'private', 'shared', 'digital_ticket', 'voucher_required', 'external_inventory', 'multi_day', 'accommodation', 'transport');--> statement-breakpoint
CREATE TYPE "public"."product_capacity_mode" AS ENUM('free_sale', 'limited', 'on_request');--> statement-breakpoint
CREATE TYPE "public"."product_delivery_format" AS ENUM('voucher', 'ticket', 'pdf', 'qr_code', 'barcode', 'email', 'mobile', 'none');--> statement-breakpoint
CREATE TYPE "public"."product_feature_type" AS ENUM('inclusion', 'exclusion', 'highlight', 'important_information', 'other');--> statement-breakpoint
CREATE TYPE "public"."product_location_type" AS ENUM('start', 'end', 'meeting_point', 'pickup', 'dropoff', 'point_of_interest', 'other');--> statement-breakpoint
CREATE TYPE "public"."product_media_type" AS ENUM('image', 'video', 'document');--> statement-breakpoint
CREATE TYPE "public"."product_option_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."product_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."product_ticket_fulfillment" AS ENUM('none', 'per_booking', 'per_participant', 'per_item');--> statement-breakpoint
CREATE TYPE "public"."product_visibility" AS ENUM('public', 'private', 'hidden');--> statement-breakpoint
CREATE TYPE "public"."fx_rate_source" AS ENUM('manual', 'ecb', 'custom', 'channel', 'supplier', 'other');--> statement-breakpoint
CREATE TYPE "public"."market_channel_scope" AS ENUM('all', 'b2c', 'b2b', 'internal');--> statement-breakpoint
CREATE TYPE "public"."market_sellability" AS ENUM('sellable', 'on_request', 'unavailable');--> statement-breakpoint
CREATE TYPE "public"."market_status" AS ENUM('active', 'inactive', 'archived');--> statement-breakpoint
CREATE TYPE "public"."market_visibility" AS ENUM('public', 'private', 'hidden');--> statement-breakpoint
CREATE TYPE "public"."addon_pricing_mode" AS ENUM('included', 'per_person', 'per_booking', 'on_request', 'unavailable');--> statement-breakpoint
CREATE TYPE "public"."cancellation_charge_type" AS ENUM('none', 'amount', 'percentage');--> statement-breakpoint
CREATE TYPE "public"."cancellation_policy_type" AS ENUM('simple', 'advanced', 'non_refundable', 'custom');--> statement-breakpoint
CREATE TYPE "public"."option_pricing_mode" AS ENUM('per_person', 'per_booking', 'starting_from', 'free', 'on_request');--> statement-breakpoint
CREATE TYPE "public"."option_start_time_rule_mode" AS ENUM('included', 'excluded', 'override', 'adjustment');--> statement-breakpoint
CREATE TYPE "public"."option_unit_pricing_mode" AS ENUM('per_unit', 'per_person', 'per_booking', 'included', 'free', 'on_request');--> statement-breakpoint
CREATE TYPE "public"."price_adjustment_type" AS ENUM('fixed', 'percentage');--> statement-breakpoint
CREATE TYPE "public"."price_catalog_type" AS ENUM('public', 'contract', 'net', 'gross', 'promo', 'internal', 'other');--> statement-breakpoint
CREATE TYPE "public"."pricing_category_type" AS ENUM('adult', 'child', 'infant', 'senior', 'group', 'room', 'vehicle', 'service', 'other');--> statement-breakpoint
CREATE TYPE "public"."pricing_dependency_type" AS ENUM('requires', 'limits_per_master', 'limits_sum', 'excludes');--> statement-breakpoint
CREATE TYPE "public"."promotional_offer_discount_type" AS ENUM('percentage', 'fixed_amount');--> statement-breakpoint
CREATE TYPE "public"."offer_expiration_event_status" AS ENUM('scheduled', 'expired', 'cancelled', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."offer_refresh_run_status" AS ENUM('pending', 'running', 'completed', 'failed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."sellability_explanation_type" AS ENUM('sellable', 'blocked', 'warning', 'pricing', 'allotment', 'pickup', 'policy');--> statement-breakpoint
CREATE TYPE "public"."sellability_policy_result_status" AS ENUM('passed', 'blocked', 'warning', 'adjusted');--> statement-breakpoint
CREATE TYPE "public"."sellability_policy_scope" AS ENUM('global', 'product', 'option', 'market', 'channel');--> statement-breakpoint
CREATE TYPE "public"."sellability_policy_type" AS ENUM('capability', 'occupancy', 'pickup', 'question', 'allotment', 'availability_window', 'currency', 'custom');--> statement-breakpoint
CREATE TYPE "public"."sellability_snapshot_component_kind" AS ENUM('base', 'unit', 'pickup', 'start_time_adjustment');--> statement-breakpoint
CREATE TYPE "public"."sellability_snapshot_status" AS ENUM('resolved', 'offer_constructed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."booking_extra_status" AS ENUM('draft', 'selected', 'confirmed', 'cancelled', 'fulfilled');--> statement-breakpoint
CREATE TYPE "public"."extra_collection_status" AS ENUM('not_required', 'pending', 'collected', 'waived', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."extra_participant_selection_status" AS ENUM('selected', 'cancelled', 'fulfilled', 'no_show');--> statement-breakpoint
CREATE TYPE "public"."booking_answer_target" AS ENUM('booking', 'traveler', 'extra');--> statement-breakpoint
CREATE TYPE "public"."booking_question_field_type" AS ENUM('text', 'textarea', 'number', 'email', 'phone', 'date', 'datetime', 'boolean', 'single_select', 'multi_select', 'file', 'country', 'other');--> statement-breakpoint
CREATE TYPE "public"."booking_question_target" AS ENUM('booking', 'traveler', 'lead_traveler', 'booker', 'extra', 'service');--> statement-breakpoint
CREATE TYPE "public"."booking_question_trigger_mode" AS ENUM('required', 'optional', 'hidden');--> statement-breakpoint
CREATE TYPE "public"."contact_requirement_field" AS ENUM('first_name', 'last_name', 'email', 'phone', 'date_of_birth', 'nationality', 'passport_number', 'passport_expiry', 'dietary_requirements', 'accessibility_needs', 'special_requests', 'address', 'other');--> statement-breakpoint
CREATE TYPE "public"."contact_requirement_scope" AS ENUM('booking', 'lead_traveler', 'traveler', 'booker');--> statement-breakpoint
CREATE TYPE "public"."booking_group_kind" AS ENUM('shared_room', 'cruise_party', 'other');--> statement-breakpoint
CREATE TYPE "public"."booking_group_member_role" AS ENUM('primary', 'shared');--> statement-breakpoint
CREATE TYPE "public"."booking_activity_type" AS ENUM('booking_created', 'booking_reserved', 'booking_converted', 'booking_confirmed', 'booking_started', 'booking_completed', 'hold_extended', 'hold_expired', 'status_change', 'status_overridden', 'item_update', 'allocation_released', 'fulfillment_issued', 'fulfillment_updated', 'redemption_recorded', 'supplier_update', 'traveler_update', 'note_added', 'system_action');--> statement-breakpoint
CREATE TYPE "public"."booking_allocation_status" AS ENUM('held', 'confirmed', 'released', 'expired', 'cancelled', 'fulfilled');--> statement-breakpoint
CREATE TYPE "public"."booking_allocation_type" AS ENUM('unit', 'pickup', 'resource');--> statement-breakpoint
CREATE TYPE "public"."booking_document_type" AS ENUM('visa', 'insurance', 'health', 'passport_copy', 'other');--> statement-breakpoint
CREATE TYPE "public"."booking_fulfillment_delivery_channel" AS ENUM('download', 'email', 'api', 'wallet', 'other');--> statement-breakpoint
CREATE TYPE "public"."booking_fulfillment_status" AS ENUM('pending', 'issued', 'reissued', 'revoked', 'failed');--> statement-breakpoint
CREATE TYPE "public"."booking_fulfillment_type" AS ENUM('voucher', 'ticket', 'pdf', 'qr_code', 'barcode', 'mobile', 'other');--> statement-breakpoint
CREATE TYPE "public"."booking_item_participant_role" AS ENUM('traveler', 'occupant', 'beneficiary', 'other');--> statement-breakpoint
CREATE TYPE "public"."booking_item_status" AS ENUM('draft', 'on_hold', 'confirmed', 'cancelled', 'expired', 'fulfilled');--> statement-breakpoint
CREATE TYPE "public"."booking_item_type" AS ENUM('unit', 'extra', 'service', 'fee', 'tax', 'discount', 'adjustment', 'accommodation', 'transport', 'other');--> statement-breakpoint
CREATE TYPE "public"."booking_participant_type" AS ENUM('traveler', 'occupant', 'other');--> statement-breakpoint
CREATE TYPE "public"."booking_pii_access_action" AS ENUM('read', 'update', 'delete');--> statement-breakpoint
CREATE TYPE "public"."booking_pii_access_outcome" AS ENUM('allowed', 'denied');--> statement-breakpoint
CREATE TYPE "public"."booking_redemption_method" AS ENUM('manual', 'scan', 'api', 'other');--> statement-breakpoint
CREATE TYPE "public"."booking_source_type" AS ENUM('direct', 'manual', 'affiliate', 'ota', 'reseller', 'api_partner', 'internal');--> statement-breakpoint
CREATE TYPE "public"."booking_staff_assignment_role" AS ENUM('service_assignee', 'other');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('draft', 'on_hold', 'awaiting_payment', 'confirmed', 'in_progress', 'completed', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."booking_traveler_category" AS ENUM('adult', 'child', 'infant', 'senior', 'other');--> statement-breakpoint
CREATE TYPE "public"."supplier_confirmation_status" AS ENUM('pending', 'confirmed', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."ap_service_type" AS ENUM('transport', 'flight', 'accommodation', 'guide', 'meal', 'experience', 'insurance', 'other');--> statement-breakpoint
CREATE TYPE "public"."capture_mode" AS ENUM('automatic', 'manual');--> statement-breakpoint
CREATE TYPE "public"."commission_model" AS ENUM('percentage', 'fixed', 'markup', 'net');--> statement-breakpoint
CREATE TYPE "public"."commission_recipient_type" AS ENUM('channel', 'affiliate', 'agency', 'agent', 'internal', 'supplier', 'other');--> statement-breakpoint
CREATE TYPE "public"."commission_status" AS ENUM('pending', 'accrued', 'payable', 'paid', 'void');--> statement-breakpoint
CREATE TYPE "public"."cost_allocation_split_method" AS ENUM('manual', 'per_pax', 'equal', 'weighted');--> statement-breakpoint
CREATE TYPE "public"."cost_allocation_target_type" AS ENUM('departure', 'product', 'booking', 'traveler', 'unattributed');--> statement-breakpoint
CREATE TYPE "public"."credit_note_status" AS ENUM('draft', 'issued', 'applied');--> statement-breakpoint
CREATE TYPE "public"."guarantee_status" AS ENUM('pending', 'active', 'released', 'failed', 'cancelled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."guarantee_type" AS ENUM('deposit', 'credit_card', 'preauth', 'card_on_file', 'bank_transfer', 'voucher', 'agency_letter', 'other');--> statement-breakpoint
CREATE TYPE "public"."invoice_number_reset_strategy" AS ENUM('never', 'annual', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."invoice_number_series_scope" AS ENUM('invoice', 'proforma', 'credit_note');--> statement-breakpoint
CREATE TYPE "public"."invoice_rendition_format" AS ENUM('html', 'pdf', 'xml', 'json');--> statement-breakpoint
CREATE TYPE "public"."invoice_rendition_status" AS ENUM('pending', 'ready', 'failed', 'stale');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'pending_external_allocation', 'issued', 'partially_paid', 'paid', 'overdue', 'void');--> statement-breakpoint
CREATE TYPE "public"."invoice_template_body_format" AS ENUM('html', 'markdown', 'lexical_json');--> statement-breakpoint
CREATE TYPE "public"."invoice_type" AS ENUM('invoice', 'proforma', 'credit_note');--> statement-breakpoint
CREATE TYPE "public"."payment_authorization_status" AS ENUM('pending', 'authorized', 'partially_captured', 'captured', 'voided', 'failed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."payment_capture_status" AS ENUM('pending', 'completed', 'failed', 'refunded', 'voided');--> statement-breakpoint
CREATE TYPE "public"."payment_instrument_owner_type" AS ENUM('client', 'supplier', 'channel', 'agency', 'internal', 'other');--> statement-breakpoint
CREATE TYPE "public"."payment_instrument_status" AS ENUM('active', 'inactive', 'expired', 'revoked', 'failed_verification');--> statement-breakpoint
CREATE TYPE "public"."payment_instrument_type" AS ENUM('credit_card', 'debit_card', 'bank_account', 'wallet', 'voucher', 'direct_bill', 'cash', 'other');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('bank_transfer', 'credit_card', 'debit_card', 'cash', 'cheque', 'wallet', 'direct_bill', 'voucher', 'other');--> statement-breakpoint
CREATE TYPE "public"."payment_schedule_status" AS ENUM('pending', 'due', 'paid', 'waived', 'cancelled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."payment_schedule_type" AS ENUM('deposit', 'installment', 'balance', 'hold', 'other');--> statement-breakpoint
CREATE TYPE "public"."payment_session_status" AS ENUM('pending', 'requires_redirect', 'processing', 'authorized', 'paid', 'failed', 'cancelled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."payment_session_target_type" AS ENUM('booking', 'order', 'invoice', 'booking_payment_schedule', 'booking_guarantee', 'flight_order', 'other');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'completed', 'failed', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."supplier_invoice_status" AS ENUM('draft', 'received', 'approved', 'partially_paid', 'paid', 'disputed', 'void');--> statement-breakpoint
CREATE TYPE "public"."tax_regime_code" AS ENUM('standard', 'reduced', 'exempt', 'reverse_charge', 'margin_scheme_art311', 'zero_rated', 'out_of_scope', 'other');--> statement-breakpoint
CREATE TYPE "public"."tax_scope" AS ENUM('included', 'excluded', 'withheld');--> statement-breakpoint
CREATE TYPE "public"."voucher_source_type" AS ENUM('refund', 'cancellation_credit', 'gift', 'manual', 'promo');--> statement-breakpoint
CREATE TYPE "public"."voucher_status" AS ENUM('active', 'redeemed', 'expired', 'void');--> statement-breakpoint
CREATE TYPE "public"."tax_class_applies_to" AS ENUM('base', 'addon', 'accommodation', 'all');--> statement-breakpoint
CREATE TYPE "public"."tax_policy_side" AS ENUM('sell', 'buy');--> statement-breakpoint
CREATE TYPE "public"."availability_slot_status" AS ENUM('open', 'closed', 'sold_out', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."meeting_mode" AS ENUM('meeting_only', 'pickup_only', 'meet_or_pickup');--> statement-breakpoint
CREATE TYPE "public"."pickup_group_kind" AS ENUM('pickup', 'dropoff', 'meeting');--> statement-breakpoint
CREATE TYPE "public"."pickup_timing_mode" AS ENUM('fixed_time', 'offset_from_start');--> statement-breakpoint
CREATE TYPE "public"."ground_assignment_source" AS ENUM('manual', 'suggested', 'auto');--> statement-breakpoint
CREATE TYPE "public"."ground_checkpoint_status" AS ENUM('pending', 'reached', 'missed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."ground_dispatch_leg_type" AS ENUM('pickup', 'stop', 'dropoff', 'deadhead');--> statement-breakpoint
CREATE TYPE "public"."ground_dispatch_status" AS ENUM('draft', 'scheduled', 'assigned', 'en_route', 'arrived', 'picked_up', 'completed', 'cancelled', 'no_show');--> statement-breakpoint
CREATE TYPE "public"."ground_driver_shift_status" AS ENUM('scheduled', 'available', 'on_duty', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."ground_execution_event_type" AS ENUM('scheduled', 'assigned', 'driver_en_route', 'driver_arrived', 'pickup_completed', 'dropoff_completed', 'cancelled', 'issue', 'note');--> statement-breakpoint
CREATE TYPE "public"."ground_incident_resolution_status" AS ENUM('open', 'mitigated', 'resolved', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."ground_incident_severity" AS ENUM('info', 'warning', 'critical');--> statement-breakpoint
CREATE TYPE "public"."ground_service_level" AS ENUM('private', 'shared', 'vip', 'shuttle', 'other');--> statement-breakpoint
CREATE TYPE "public"."ground_vehicle_category" AS ENUM('car', 'sedan', 'suv', 'van', 'minibus', 'bus', 'boat', 'train', 'other');--> statement-breakpoint
CREATE TYPE "public"."ground_vehicle_class" AS ENUM('economy', 'standard', 'premium', 'luxury', 'accessible', 'other');--> statement-breakpoint
CREATE TYPE "public"."facility_day_of_week" AS ENUM('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday');--> statement-breakpoint
CREATE TYPE "public"."facility_feature_category" AS ENUM('amenity', 'accessibility', 'security', 'service', 'policy', 'other');--> statement-breakpoint
CREATE TYPE "public"."facility_kind" AS ENUM('property', 'hotel', 'resort', 'venue', 'meeting_point', 'transfer_hub', 'airport', 'station', 'marina', 'camp', 'lodge', 'office', 'attraction', 'restaurant', 'other');--> statement-breakpoint
CREATE TYPE "public"."facility_owner_type" AS ENUM('supplier', 'organization', 'internal', 'other');--> statement-breakpoint
CREATE TYPE "public"."facility_status" AS ENUM('active', 'inactive', 'archived');--> statement-breakpoint
CREATE TYPE "public"."property_group_membership_role" AS ENUM('member', 'flagship', 'managed', 'franchise', 'other');--> statement-breakpoint
CREATE TYPE "public"."property_group_status" AS ENUM('active', 'inactive', 'archived');--> statement-breakpoint
CREATE TYPE "public"."property_group_type" AS ENUM('chain', 'brand', 'management_company', 'collection', 'portfolio', 'cluster', 'other');--> statement-breakpoint
CREATE TYPE "public"."property_type" AS ENUM('hotel', 'resort', 'villa', 'apartment', 'hostel', 'lodge', 'camp', 'other');--> statement-breakpoint
CREATE TYPE "public"."resource_allocation_mode" AS ENUM('shared', 'exclusive');--> statement-breakpoint
CREATE TYPE "public"."resource_assignment_status" AS ENUM('reserved', 'assigned', 'released', 'cancelled', 'completed');--> statement-breakpoint
CREATE TYPE "public"."resource_kind" AS ENUM('guide', 'vehicle', 'room', 'boat', 'equipment', 'other');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('email', 'sms');--> statement-breakpoint
CREATE TYPE "public"."notification_delivery_status" AS ENUM('pending', 'sent', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."notification_reminder_run_status" AS ENUM('queued', 'processing', 'sent', 'skipped', 'failed');--> statement-breakpoint
CREATE TYPE "public"."notification_reminder_stage_anchor" AS ENUM('due_date', 'booking_created_at', 'departure_date', 'invoice_issued_at', 'last_send_at');--> statement-breakpoint
CREATE TYPE "public"."notification_reminder_stage_cadence_kind" AS ENUM('once', 'every_n_days', 'escalating');--> statement-breakpoint
CREATE TYPE "public"."notification_reminder_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."notification_reminder_target_type" AS ENUM('booking_confirmed', 'booking_payment_schedule', 'payment_complete', 'booking_cancelled_non_payment', 'invoice');--> statement-breakpoint
CREATE TYPE "public"."notification_stage_recipient_kind" AS ENUM('primary', 'cc', 'bcc');--> statement-breakpoint
CREATE TYPE "public"."notification_target_type" AS ENUM('booking', 'booking_payment_schedule', 'booking_guarantee', 'invoice', 'payment_session', 'person', 'organization', 'other');--> statement-breakpoint
CREATE TYPE "public"."notification_template_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."contract_body_format" AS ENUM('markdown', 'html', 'lexical_json');--> statement-breakpoint
CREATE TYPE "public"."contract_number_reset_strategy" AS ENUM('never', 'annual', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."contract_scope" AS ENUM('customer', 'supplier', 'partner', 'channel', 'other');--> statement-breakpoint
CREATE TYPE "public"."contract_signature_method" AS ENUM('manual', 'electronic', 'docusign', 'other');--> statement-breakpoint
CREATE TYPE "public"."contract_status" AS ENUM('draft', 'issued', 'sent', 'signed', 'executed', 'expired', 'void');--> statement-breakpoint
CREATE TYPE "public"."policy_acceptance_method" AS ENUM('implicit', 'explicit_checkbox', 'signature');--> statement-breakpoint
CREATE TYPE "public"."policy_assignment_scope" AS ENUM('product', 'channel', 'supplier', 'market', 'organization', 'global');--> statement-breakpoint
CREATE TYPE "public"."policy_kind" AS ENUM('cancellation', 'payment', 'terms_and_conditions', 'privacy', 'refund', 'commission', 'guarantee', 'other');--> statement-breakpoint
CREATE TYPE "public"."policy_refund_type" AS ENUM('cash', 'credit', 'cash_or_credit', 'none');--> statement-breakpoint
CREATE TYPE "public"."policy_rule_type" AS ENUM('window', 'percentage', 'flat_amount', 'date_range', 'custom');--> statement-breakpoint
CREATE TYPE "public"."policy_version_status" AS ENUM('draft', 'published', 'retired');--> statement-breakpoint
CREATE TYPE "public"."legal_target_kind" AS ENUM('booking', 'proposal_version', 'program', 'product', 'inventory_item', 'supplier_channel_relationship', 'provider_source_ref');--> statement-breakpoint
CREATE TYPE "public"."legal_term_acceptance_status" AS ENUM('not_required', 'pending', 'accepted', 'declined');--> statement-breakpoint
CREATE TYPE "public"."legal_term_type" AS ENUM('terms_and_conditions', 'cancellation', 'guarantee', 'payment', 'pricing', 'commission', 'other');--> statement-breakpoint
CREATE TYPE "public"."storefront_verification_channel" AS ENUM('email', 'sms');--> statement-breakpoint
CREATE TYPE "public"."storefront_verification_status" AS ENUM('pending', 'verified', 'expired', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."trip_component_event_type" AS ENUM('created', 'updated', 'priced', 'hold_placed', 'booked', 'checkout_started', 'failed', 'cancelled', 'removed', 'staff_remediation_required');--> statement-breakpoint
CREATE TYPE "public"."trip_component_kind" AS ENUM('catalog_booking', 'manual_placeholder', 'flight_placeholder', 'flight_order', 'external_order');--> statement-breakpoint
CREATE TYPE "public"."trip_component_status" AS ENUM('draft', 'priced', 'unavailable', 'held', 'booked', 'checkout_started', 'failed', 'cancelled', 'removed');--> statement-breakpoint
CREATE TYPE "public"."trip_envelope_status" AS ENUM('draft', 'priced', 'reserve_in_progress', 'reserved', 'checkout_started', 'booked', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."trip_reservation_plan_status" AS ENUM('pending', 'submitted', 'reserved', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."workflow_run_status" AS ENUM('running', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."workflow_run_step_status" AS ENUM('running', 'succeeded', 'failed', 'skipped', 'compensated');--> statement-breakpoint
CREATE TYPE "public"."accommodation_guarantee_mode" AS ENUM('none', 'card_hold', 'deposit', 'full_prepay', 'on_request');--> statement-breakpoint
CREATE TYPE "public"."accommodation_inventory_mode" AS ENUM('pooled', 'serialized', 'virtual');--> statement-breakpoint
CREATE TYPE "public"."rate_plan_charge_frequency" AS ENUM('per_night', 'per_stay', 'per_person_per_night', 'per_person_per_stay');--> statement-breakpoint
CREATE TYPE "public"."stay_booking_item_status" AS ENUM('reserved', 'cancelled', 'no_show');--> statement-breakpoint
CREATE TYPE "public"."charter_booking_mode" AS ENUM('per_suite', 'whole_yacht');--> statement-breakpoint
CREATE TYPE "public"."charter_source" AS ENUM('local', 'external');--> statement-breakpoint
CREATE TYPE "public"."charter_status" AS ENUM('draft', 'awaiting_review', 'live', 'archived');--> statement-breakpoint
CREATE TYPE "public"."charter_suite_availability" AS ENUM('available', 'limited', 'on_request', 'wait_list', 'sold_out');--> statement-breakpoint
CREATE TYPE "public"."charter_suite_category" AS ENUM('standard', 'deluxe', 'suite', 'penthouse', 'owners', 'signature');--> statement-breakpoint
CREATE TYPE "public"."charter_voyage_sales_status" AS ENUM('open', 'on_request', 'wait_list', 'sold_out', 'closed');--> statement-breakpoint
CREATE TYPE "public"."charter_yacht_class" AS ENUM('luxury_motor', 'luxury_sailing', 'expedition', 'small_cruise');--> statement-breakpoint
CREATE TYPE "public"."cruise_air_arrangement" AS ENUM('cruise_line', 'independent', 'none');--> statement-breakpoint
CREATE TYPE "public"."cruise_booking_mode" AS ENUM('inquiry', 'reserve');--> statement-breakpoint
CREATE TYPE "public"."cruise_cabin_room_type" AS ENUM('inside', 'oceanview', 'balcony', 'suite', 'penthouse', 'single');--> statement-breakpoint
CREATE TYPE "public"."cruise_inclusion_kind" AS ENUM('meals', 'drinks', 'gratuities', 'transfers', 'excursions', 'wifi', 'other');--> statement-breakpoint
CREATE TYPE "public"."cruise_media_type" AS ENUM('image', 'video', 'document');--> statement-breakpoint
CREATE TYPE "public"."cruise_sailing_direction" AS ENUM('upstream', 'downstream', 'round_trip', 'one_way');--> statement-breakpoint
CREATE TYPE "public"."cruise_source" AS ENUM('local', 'external');--> statement-breakpoint
CREATE TYPE "public"."cruise_status" AS ENUM('draft', 'awaiting_review', 'live', 'archived');--> statement-breakpoint
CREATE TYPE "public"."cruise_type" AS ENUM('ocean', 'river', 'expedition', 'coastal');--> statement-breakpoint
CREATE TYPE "public"."cruise_voyage_group_kind" AS ENUM('combination', 'grand_voyage', 'world_cruise', 'cruise_tour');--> statement-breakpoint
CREATE TYPE "public"."cruise_voyage_segment_kind" AS ENUM('cruise', 'land', 'hotel', 'transfer', 'rail', 'air', 'other');--> statement-breakpoint
CREATE TYPE "public"."cruise_voyage_segment_role" AS ENUM('core', 'pre_extension', 'post_extension');--> statement-breakpoint
CREATE TYPE "public"."cruise_enrichment_program_kind" AS ENUM('naturalist', 'historian', 'photographer', 'lecturer', 'expert', 'other');--> statement-breakpoint
CREATE TYPE "public"."cruise_price_availability" AS ENUM('available', 'limited', 'on_request', 'wait_list', 'sold_out');--> statement-breakpoint
CREATE TYPE "public"."cruise_price_component_direction" AS ENUM('addition', 'inclusion', 'credit');--> statement-breakpoint
CREATE TYPE "public"."cruise_price_component_kind" AS ENUM('gratuity', 'onboard_credit', 'port_charge', 'tax', 'ncf', 'airfare', 'transfer', 'insurance');--> statement-breakpoint
CREATE TYPE "public"."cruise_price_fare_variant" AS ENUM('cruise_only', 'air_inclusive');--> statement-breakpoint
CREATE TYPE "public"."cruise_sailing_sales_status" AS ENUM('open', 'on_request', 'wait_list', 'sold_out', 'closed');--> statement-breakpoint
CREATE TYPE "public"."cruise_ship_type" AS ENUM('ocean', 'river', 'expedition', 'yacht', 'sailing', 'coastal');--> statement-breakpoint
CREATE TABLE "aggregate_snapshots" (
	"key" text PRIMARY KEY NOT NULL,
	"payload" jsonb NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"stale_after" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "aggregate_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "apikey" (
	"id" text PRIMARY KEY NOT NULL,
	"config_id" text DEFAULT 'default' NOT NULL,
	"name" text,
	"start" text,
	"prefix" text,
	"key" text NOT NULL,
	"reference_id" text NOT NULL,
	"refill_interval" integer,
	"refill_amount" integer,
	"last_refill_at" timestamp with time zone,
	"enabled" boolean DEFAULT true NOT NULL,
	"rate_limit_enabled" boolean DEFAULT false NOT NULL,
	"rate_limit_time_window" integer,
	"rate_limit_max" integer,
	"request_count" integer DEFAULT 0 NOT NULL,
	"remaining" integer,
	"last_request" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone,
	"permissions" text,
	"metadata" text
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"inviter_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"role" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"metadata" text,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"active_organization_id" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"email_verified" boolean NOT NULL,
	"phone_number" text,
	"phone_number_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "user_email_or_phone" CHECK ("user"."email" IS NOT NULL OR "user"."phone_number" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "cloud_auth_session_links" (
	"session_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider_id" text DEFAULT 'voyant-cloud' NOT NULL,
	"provider_account_id" text NOT NULL,
	"deployment_id" text NOT NULL,
	"revalidate_after" timestamp with time zone NOT NULL,
	"last_revalidated_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cloud_auth_user_links" (
	"user_id" text PRIMARY KEY NOT NULL,
	"provider_id" text DEFAULT 'voyant-cloud' NOT NULL,
	"provider_account_id" text NOT NULL,
	"deployment_id" text NOT NULL,
	"platform_organization_id" text NOT NULL,
	"workos_organization_id" text NOT NULL,
	"membership_id" text,
	"role_slug" text,
	"role_name" text,
	"surfaces" jsonb DEFAULT '[]'::jsonb,
	"last_assertion_at" timestamp with time zone,
	"last_revalidated_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"redeemed_at" timestamp with time zone,
	"redeemed_by_user_id" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"first_name" text,
	"last_name" text,
	"avatar_url" text,
	"locale" text DEFAULT 'en' NOT NULL,
	"timezone" text,
	"ui_prefs" jsonb DEFAULT '{}'::jsonb,
	"seating_preference" "seating_preference",
	"is_super_admin" boolean DEFAULT false NOT NULL,
	"is_support_user" boolean DEFAULT false NOT NULL,
	"terms_accepted_at" timestamp with time zone,
	"notification_defaults" jsonb DEFAULT '{}'::jsonb,
	"marketing_consent" boolean DEFAULT false NOT NULL,
	"marketing_consent_at" timestamp with time zone,
	"marketing_consent_source" text,
	"last_active_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "domains" (
	"id" text PRIMARY KEY NOT NULL,
	"domain" text NOT NULL,
	"status" "domain_status" DEFAULT 'pending' NOT NULL,
	"provider" "domain_provider" DEFAULT 'cloudflare',
	"provider_hostname_id" text,
	"provider_zone_id" text,
	"certificate_status" text,
	"hostname_status" text,
	"verification_records" jsonb,
	"custom_metadata" jsonb,
	"email_provider" "email_provider",
	"email_region" "resend_region",
	"email_provider_domain_id" text,
	"email_return_path_domain" text,
	"email_tracking_domain" text,
	"email_dmarc_policy" text,
	"email_click_tracking" boolean DEFAULT false NOT NULL,
	"email_open_tracking" boolean DEFAULT false NOT NULL,
	"email_tls_mode" "tls_mode" DEFAULT 'opportunistic',
	"email_config_encrypted" text,
	"email_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "domains" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "event_outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"name" text NOT NULL,
	"payload" jsonb,
	"metadata" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 8 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "event_outbox" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"scope" text NOT NULL,
	"key" text NOT NULL,
	"body_hash" text NOT NULL,
	"response_status" integer NOT NULL,
	"response_body" jsonb NOT NULL,
	"reference_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "idempotency_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "public_document_delivery_grants" (
	"id" text PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"storage_key" text NOT NULL,
	"storage_provider" text,
	"filename" text,
	"content_type" text DEFAULT 'application/octet-stream' NOT NULL,
	"source_module" text,
	"source_entity" text,
	"source_id" text,
	"created_by" text,
	"created_by_type" text,
	"metadata" jsonb,
	"access_count" integer DEFAULT 0 NOT NULL,
	"last_accessed_at" timestamp with time zone,
	"last_accessed_ip" text,
	"last_accessed_user_agent" text,
	"revoked_at" timestamp with time zone,
	"revoked_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "public_document_delivery_grants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "rate_limit_buckets" (
	"scope" text PRIMARY KEY NOT NULL,
	"tokens_available" numeric NOT NULL,
	"capacity" numeric NOT NULL,
	"refill_rate_per_sec" numeric NOT NULL,
	"last_refill_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rate_limit_buckets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"source_module" text NOT NULL,
	"source_event" text NOT NULL,
	"source_entity_module" text,
	"source_entity_id" text,
	"subscription_id" text,
	"target_url" text NOT NULL,
	"target_kind" text,
	"target_ref" text,
	"request_method" text NOT NULL,
	"request_headers" jsonb,
	"request_body_hash" text,
	"request_body_excerpt" text,
	"response_status" integer,
	"response_headers" jsonb,
	"response_body_excerpt" text,
	"attempt_number" integer DEFAULT 1 NOT NULL,
	"parent_delivery_id" text,
	"idempotency_key" text,
	"status" text NOT NULL,
	"scheduled_for" timestamp with time zone,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"duration_ms" integer,
	"error_class" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "webhook_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"events" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"secret" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"max_retries" integer DEFAULT 5 NOT NULL,
	"headers" jsonb,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_delivery_at" timestamp with time zone,
	"failure_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "webhook_subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "write_intents" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"result" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "write_intents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "action_approvals" (
	"id" text PRIMARY KEY NOT NULL,
	"requested_action_id" text NOT NULL,
	"status" "action_ledger_approval_status" DEFAULT 'pending' NOT NULL,
	"requested_by_principal_id" text NOT NULL,
	"assigned_to_principal_id" text,
	"decided_by_principal_id" text,
	"delegated_from_principal_id" text,
	"policy_name" text NOT NULL,
	"policy_version" text NOT NULL,
	"target_snapshot_ref" text,
	"risk_snapshot" "action_ledger_risk" NOT NULL,
	"reason_code" text,
	"expires_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "action_delegations" (
	"id" text PRIMARY KEY NOT NULL,
	"root_principal_type" "action_ledger_principal_type" NOT NULL,
	"root_principal_id" text NOT NULL,
	"parent_principal_type" "action_ledger_principal_type" NOT NULL,
	"parent_principal_id" text NOT NULL,
	"child_principal_type" "action_ledger_principal_type" NOT NULL,
	"child_principal_id" text NOT NULL,
	"grant_source" text NOT NULL,
	"capability_scope_ref" text,
	"budget_scope_ref" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "action_ledger_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"action_name" text NOT NULL,
	"action_version" text NOT NULL,
	"action_kind" "action_ledger_action_kind" NOT NULL,
	"status" "action_ledger_status" NOT NULL,
	"evaluated_risk" "action_ledger_risk" NOT NULL,
	"actor_type" text,
	"principal_type" "action_ledger_principal_type" NOT NULL,
	"principal_id" text NOT NULL,
	"principal_subtype" text,
	"session_id" text,
	"api_token_id" text,
	"internal_request" boolean DEFAULT false NOT NULL,
	"delegated_by_principal_type" "action_ledger_principal_type",
	"delegated_by_principal_id" text,
	"delegation_id" text,
	"caller_type" text,
	"organization_id" text,
	"route_or_tool_name" text,
	"workflow_run_id" text,
	"workflow_step_id" text,
	"correlation_id" text,
	"causation_action_id" text,
	"idempotency_scope" text,
	"idempotency_key" text,
	"idempotency_fingerprint" text,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"capability_id" text,
	"capability_version" text,
	"authorization_source" text,
	"approval_id" text,
	"amends_action_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "action_ledger_payloads" (
	"id" text PRIMARY KEY NOT NULL,
	"action_id" text NOT NULL,
	"payload_kind" text NOT NULL,
	"schema_tag" text NOT NULL,
	"redaction_status" "action_ledger_redaction_status" DEFAULT 'none' NOT NULL,
	"retention_policy" text NOT NULL,
	"storage_ref" text NOT NULL,
	"hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "action_ledger_outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"action_id" text NOT NULL,
	"organization_id" text,
	"relay_status" "action_ledger_relay_status" DEFAULT 'pending' NOT NULL,
	"payload_ref" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_retry_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "action_mutation_details" (
	"action_id" text PRIMARY KEY NOT NULL,
	"command_input_ref" text,
	"command_result_ref" text,
	"summary" text,
	"reversal_kind" "action_ledger_reversal_kind" DEFAULT 'none' NOT NULL,
	"reversal_command_id" text,
	"reversal_command_version" text,
	"reversal_args_ref" text,
	"reversal_state_projection" "action_ledger_reversal_state",
	"reversal_outcome_projection" "action_ledger_reversal_outcome",
	"reverses_action_id" text,
	"reversed_by_action_id_projection" text
);
--> statement-breakpoint
CREATE TABLE "action_sensitive_read_details" (
	"action_id" text PRIMARY KEY NOT NULL,
	"reason_code" text,
	"disclosed_field_set" jsonb,
	"disclosure_summary" text,
	"decision_policy" text
);
--> statement-breakpoint
CREATE TABLE "communication_log" (
	"id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"organization_id" text,
	"channel" "communication_channel" NOT NULL,
	"direction" "communication_direction" NOT NULL,
	"subject" text,
	"content" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"author_id" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"legal_name" text,
	"website" text,
	"tax_id" text,
	"industry" text,
	"relation" "relation_type",
	"owner_id" text,
	"default_currency" text,
	"preferred_language" text,
	"payment_terms" integer,
	"status" "record_status" DEFAULT 'active' NOT NULL,
	"source" text,
	"source_ref" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"first_name" text NOT NULL,
	"middle_name" text,
	"last_name" text NOT NULL,
	"gender" text,
	"job_title" text,
	"relation" "relation_type",
	"preferred_language" text,
	"preferred_currency" text,
	"owner_id" text,
	"status" "record_status" DEFAULT 'active' NOT NULL,
	"source" text,
	"source_ref" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"date_of_birth" date,
	"notes" text,
	"accessibility_encrypted" jsonb,
	"dietary_encrypted" jsonb,
	"loyalty_encrypted" jsonb,
	"insurance_encrypted" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "person_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"type" "person_document_type" NOT NULL,
	"number_encrypted" jsonb,
	"issuing_authority" text,
	"issuing_country" text,
	"issue_date" date,
	"expiry_date" date,
	"attachment_id" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "person_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"author_id" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "person_payment_methods" (
	"id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"brand" text NOT NULL,
	"last4" text,
	"holder_name" text,
	"exp_month" integer,
	"exp_year" integer,
	"processor_token" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "person_relationships" (
	"id" text PRIMARY KEY NOT NULL,
	"from_person_id" text NOT NULL,
	"to_person_id" text NOT NULL,
	"kind" "person_relationship_kind" NOT NULL,
	"inverse_kind" "person_relationship_kind",
	"start_date" date,
	"end_date" date,
	"is_primary" boolean DEFAULT false NOT NULL,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "person_relationships_no_self" CHECK ("person_relationships"."from_person_id" <> "person_relationships"."to_person_id")
);
--> statement-breakpoint
CREATE TABLE "segment_members" (
	"id" text PRIMARY KEY NOT NULL,
	"segment_id" text NOT NULL,
	"person_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "segments" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"conditions" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activities" (
	"id" text PRIMARY KEY NOT NULL,
	"subject" text NOT NULL,
	"type" "activity_type" NOT NULL,
	"owner_id" text,
	"status" "activity_status" DEFAULT 'planned' NOT NULL,
	"due_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"location" text,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_links" (
	"id" text PRIMARY KEY NOT NULL,
	"activity_id" text NOT NULL,
	"entity_type" "entity_type" NOT NULL,
	"entity_id" text NOT NULL,
	"role" "activity_link_role" DEFAULT 'related' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_participants" (
	"id" text PRIMARY KEY NOT NULL,
	"activity_id" text NOT NULL,
	"person_id" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_field_definitions" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_type" "entity_type" NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"field_type" "custom_field_type" NOT NULL,
	"is_required" boolean DEFAULT false NOT NULL,
	"is_searchable" boolean DEFAULT false NOT NULL,
	"options" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_field_values" (
	"id" text PRIMARY KEY NOT NULL,
	"definition_id" text NOT NULL,
	"entity_type" "entity_type" NOT NULL,
	"entity_id" text NOT NULL,
	"text_value" text,
	"number_value" integer,
	"date_value" date,
	"boolean_value" boolean,
	"monetary_value_cents" integer,
	"currency_code" text,
	"json_value" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_signals" (
	"id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"product_id" text,
	"option_unit_id" text,
	"kind" "customer_signal_kind" NOT NULL,
	"source" "customer_signal_source" NOT NULL,
	"status" "customer_signal_status" DEFAULT 'new' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"notes" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"assigned_to_user_id" text,
	"follow_up_at" timestamp with time zone,
	"resolved_booking_id" text,
	"source_submission_id" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_proposal_details" (
	"booking_id" text PRIMARY KEY NOT NULL,
	"proposal_id" text,
	"proposal_version_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipelines" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_type" "entity_type" DEFAULT 'proposal' NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposal_delivery_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"command_scope" text NOT NULL,
	"command_idempotency_key" text NOT NULL,
	"request_fingerprint" text NOT NULL,
	"claim_action_id" text NOT NULL,
	"organization_id" text,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"proposal_id" text NOT NULL,
	"proposal_version_id" text NOT NULL,
	"proposal_url" text NOT NULL,
	"provider" text NOT NULL,
	"result_snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "proposal_participants" (
	"id" text PRIMARY KEY NOT NULL,
	"proposal_id" text NOT NULL,
	"person_id" text NOT NULL,
	"role" "participant_role" DEFAULT 'other' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposal_products" (
	"id" text PRIMARY KEY NOT NULL,
	"proposal_id" text NOT NULL,
	"product_id" text,
	"supplier_service_id" text,
	"name_snapshot" text NOT NULL,
	"description" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price_amount_cents" integer,
	"cost_amount_cents" integer,
	"currency" text,
	"discount_amount_cents" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposal_version_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"proposal_version_id" text NOT NULL,
	"product_id" text,
	"supplier_service_id" text,
	"description" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price_amount_cents" integer DEFAULT 0 NOT NULL,
	"total_amount_cents" integer DEFAULT 0 NOT NULL,
	"currency" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposal_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"proposal_id" text NOT NULL,
	"label" text,
	"status" "proposal_version_status" DEFAULT 'draft' NOT NULL,
	"supersedes_id" text,
	"trip_snapshot_id" text,
	"valid_until" date,
	"currency" text NOT NULL,
	"subtotal_amount_cents" integer DEFAULT 0 NOT NULL,
	"tax_amount_cents" integer DEFAULT 0 NOT NULL,
	"total_amount_cents" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"sent_at" timestamp with time zone,
	"viewed_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "proposals" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"person_id" text,
	"organization_id" text,
	"pipeline_id" text NOT NULL,
	"stage_id" text NOT NULL,
	"owner_id" text,
	"status" "proposal_status" DEFAULT 'open' NOT NULL,
	"accepted_version_id" text,
	"value_amount_cents" integer,
	"value_currency" text,
	"expected_close_date" date,
	"source" text,
	"source_ref" text,
	"lost_reason" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"stage_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "stages" (
	"id" text PRIMARY KEY NOT NULL,
	"pipeline_id" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"probability" integer,
	"is_closed" boolean DEFAULT false NOT NULL,
	"is_won" boolean DEFAULT false NOT NULL,
	"is_lost" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity_addresses" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"label" "address_label" DEFAULT 'other' NOT NULL,
	"full_text" text,
	"line_1" text,
	"line_2" text,
	"city" text,
	"region" text,
	"postal_code" text,
	"country" text,
	"latitude" double precision,
	"longitude" double precision,
	"timezone" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity_contact_points" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"kind" "contact_point_kind" NOT NULL,
	"label" text,
	"value" text NOT NULL,
	"normalized_value" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity_named_contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"role" "named_contact_role" DEFAULT 'general' NOT NULL,
	"name" text NOT NULL,
	"title" text,
	"email" text,
	"phone" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_distribution_details" (
	"booking_id" text PRIMARY KEY NOT NULL,
	"market_id" text,
	"source_channel_id" text,
	"fx_rate_set_id" text,
	"payment_owner" "booking_dist_payment_owner" DEFAULT 'operator' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_refs" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"source_system" text NOT NULL,
	"object_type" text NOT NULL,
	"namespace" text DEFAULT 'default' NOT NULL,
	"external_id" text NOT NULL,
	"external_parent_id" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"status" "external_ref_status" DEFAULT 'active' NOT NULL,
	"last_synced_at" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_reconciliation_policies" (
	"id" text PRIMARY KEY NOT NULL,
	"channel_id" text NOT NULL,
	"contract_id" text,
	"frequency" "channel_reconciliation_policy_frequency" DEFAULT 'manual' NOT NULL,
	"auto_run" boolean DEFAULT false NOT NULL,
	"compare_gross_amounts" boolean DEFAULT true NOT NULL,
	"compare_statuses" boolean DEFAULT true NOT NULL,
	"compare_cancellations" boolean DEFAULT true NOT NULL,
	"amount_tolerance_cents" integer,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_release_schedules" (
	"id" text PRIMARY KEY NOT NULL,
	"release_rule_id" text NOT NULL,
	"schedule_kind" "channel_release_schedule_kind" DEFAULT 'manual' NOT NULL,
	"next_run_at" timestamp with time zone,
	"last_run_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_settlement_policies" (
	"id" text PRIMARY KEY NOT NULL,
	"channel_id" text NOT NULL,
	"contract_id" text,
	"frequency" "channel_settlement_policy_frequency" DEFAULT 'manual' NOT NULL,
	"auto_generate" boolean DEFAULT false NOT NULL,
	"approval_required" boolean DEFAULT false NOT NULL,
	"remittance_days_after_period_end" integer,
	"minimum_payout_amount_cents" integer,
	"currency_code" text,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_booking_links" (
	"id" text PRIMARY KEY NOT NULL,
	"channel_id" text NOT NULL,
	"booking_id" text NOT NULL,
	"booking_item_id" text,
	"external_booking_id" text,
	"external_reference" text,
	"external_status" text,
	"booked_at_external" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"source_kind" text,
	"source_connection_id" text,
	"push_status" text DEFAULT 'pending' NOT NULL,
	"push_attempts" integer DEFAULT 0 NOT NULL,
	"last_push_at" timestamp with time zone,
	"last_error" text,
	"pushed_payload_hash" text,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_commission_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"contract_id" text NOT NULL,
	"scope" "channel_commission_scope" NOT NULL,
	"product_id" text,
	"external_rate_id" text,
	"external_category_id" text,
	"commission_type" "channel_commission_type" NOT NULL,
	"amount_cents" integer,
	"percent_basis_points" integer,
	"valid_from" date,
	"valid_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_contact_projections" (
	"channel_id" text PRIMARY KEY NOT NULL,
	"website_contact_point_id" text,
	"primary_named_contact_id" text,
	"website" text,
	"contact_name" text,
	"contact_email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_contracts" (
	"id" text PRIMARY KEY NOT NULL,
	"channel_id" text NOT NULL,
	"supplier_id" text,
	"status" "channel_contract_status" DEFAULT 'draft' NOT NULL,
	"starts_at" date NOT NULL,
	"ends_at" date,
	"payment_owner" "distribution_payment_owner" DEFAULT 'operator' NOT NULL,
	"cancellation_owner" "distribution_cancellation_owner" DEFAULT 'operator' NOT NULL,
	"settlement_terms" text,
	"notes" text,
	"rate_limit_rps" integer,
	"rate_limit_burst" integer,
	"rate_limit_priority_gates" jsonb,
	"policy" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_product_mappings" (
	"id" text PRIMARY KEY NOT NULL,
	"channel_id" text NOT NULL,
	"product_id" text NOT NULL,
	"external_product_id" text,
	"external_rate_id" text,
	"external_category_id" text,
	"active" boolean DEFAULT true NOT NULL,
	"source_kind" text,
	"source_connection_id" text,
	"push_bookings" boolean DEFAULT true NOT NULL,
	"push_availability" boolean DEFAULT true NOT NULL,
	"push_content" boolean DEFAULT true NOT NULL,
	"policy" jsonb,
	"last_pushed_content_hash" text,
	"last_pushed_content_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"channel_id" text NOT NULL,
	"event_type" text NOT NULL,
	"external_event_id" text,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"status" "channel_webhook_status" DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channels" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"kind" "channel_kind" NOT NULL,
	"status" "channel_status" DEFAULT 'active' NOT NULL,
	"metadata" jsonb,
	"rate_limit_rps" integer,
	"rate_limit_burst" integer,
	"rate_limit_priority_gates" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_reconciliation_items" (
	"id" text PRIMARY KEY NOT NULL,
	"reconciliation_run_id" text NOT NULL,
	"booking_link_id" text,
	"booking_id" text,
	"external_booking_id" text,
	"issue_type" "channel_reconciliation_issue_type" DEFAULT 'other' NOT NULL,
	"severity" "channel_reconciliation_severity" DEFAULT 'warning' NOT NULL,
	"resolution_status" "channel_reconciliation_resolution_status" DEFAULT 'open' NOT NULL,
	"notes" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_reconciliation_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"channel_id" text NOT NULL,
	"contract_id" text,
	"status" "channel_reconciliation_run_status" DEFAULT 'draft' NOT NULL,
	"period_start" date,
	"period_end" date,
	"external_report_reference" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_remittance_exceptions" (
	"id" text PRIMARY KEY NOT NULL,
	"channel_id" text NOT NULL,
	"settlement_item_id" text,
	"reconciliation_item_id" text,
	"exception_type" text NOT NULL,
	"severity" "channel_reconciliation_severity" DEFAULT 'warning' NOT NULL,
	"status" "channel_remittance_exception_status" DEFAULT 'open' NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_settlement_approvals" (
	"id" text PRIMARY KEY NOT NULL,
	"settlement_run_id" text NOT NULL,
	"approver_user_id" text,
	"status" "channel_settlement_approval_status" DEFAULT 'pending' NOT NULL,
	"decided_at" timestamp with time zone,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_settlement_items" (
	"id" text PRIMARY KEY NOT NULL,
	"settlement_run_id" text NOT NULL,
	"booking_link_id" text,
	"booking_id" text,
	"commission_rule_id" text,
	"status" "channel_settlement_item_status" DEFAULT 'pending' NOT NULL,
	"gross_amount_cents" integer DEFAULT 0 NOT NULL,
	"commission_amount_cents" integer DEFAULT 0 NOT NULL,
	"net_remittance_amount_cents" integer DEFAULT 0 NOT NULL,
	"currency_code" text,
	"remittance_due_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_settlement_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"channel_id" text NOT NULL,
	"contract_id" text,
	"status" "channel_settlement_run_status" DEFAULT 'draft' NOT NULL,
	"currency_code" text,
	"period_start" date,
	"period_end" date,
	"statement_reference" text,
	"generated_at" timestamp with time zone,
	"posted_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_inventory_allotment_targets" (
	"id" text PRIMARY KEY NOT NULL,
	"allotment_id" text NOT NULL,
	"slot_id" text,
	"start_time_id" text,
	"date_local" date,
	"guaranteed_capacity" integer,
	"max_capacity" integer,
	"sold_capacity" integer,
	"remaining_capacity" integer,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_inventory_allotments" (
	"id" text PRIMARY KEY NOT NULL,
	"channel_id" text NOT NULL,
	"contract_id" text,
	"product_id" text NOT NULL,
	"option_id" text,
	"start_time_id" text,
	"valid_from" date,
	"valid_to" date,
	"guaranteed_capacity" integer,
	"max_capacity" integer,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_inventory_release_executions" (
	"id" text PRIMARY KEY NOT NULL,
	"allotment_id" text NOT NULL,
	"release_rule_id" text,
	"target_id" text,
	"slot_id" text,
	"action_taken" "channel_release_execution_action" DEFAULT 'released' NOT NULL,
	"status" "channel_release_execution_status" DEFAULT 'pending' NOT NULL,
	"released_capacity" integer,
	"executed_at" timestamp with time zone,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_inventory_release_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"allotment_id" text NOT NULL,
	"release_mode" "channel_allotment_release_mode" DEFAULT 'automatic' NOT NULL,
	"release_days_before_start" integer,
	"release_hours_before_start" integer,
	"unsold_action" "channel_allotment_unsold_action" DEFAULT 'release_to_general_pool' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_availability_push_intents" (
	"id" text PRIMARY KEY NOT NULL,
	"channel_id" text NOT NULL,
	"source_connection_id" text NOT NULL,
	"slot_id" text NOT NULL,
	"product_id" text NOT NULL,
	"option_id" text,
	"starts_at" timestamp with time zone NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_content_push_intents" (
	"id" text PRIMARY KEY NOT NULL,
	"channel_id" text NOT NULL,
	"source_connection_id" text NOT NULL,
	"product_id" text NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_availability" (
	"id" text PRIMARY KEY NOT NULL,
	"supplier_id" text NOT NULL,
	"date" date NOT NULL,
	"available" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_contracts" (
	"id" text PRIMARY KEY NOT NULL,
	"supplier_id" text NOT NULL,
	"agreement_number" text,
	"start_date" date NOT NULL,
	"end_date" date,
	"renewal_date" date,
	"terms" text,
	"status" "supplier_contract_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_directory_projections" (
	"supplier_id" text NOT NULL,
	"email" text,
	"phone" text,
	"website" text,
	"address" text,
	"city" text,
	"country" text,
	"contact_name" text,
	"contact_email" text,
	"contact_phone" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"supplier_id" text NOT NULL,
	"author_id" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_rates" (
	"id" text PRIMARY KEY NOT NULL,
	"service_id" text NOT NULL,
	"name" text NOT NULL,
	"currency" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"unit" "rate_unit" NOT NULL,
	"valid_from" date,
	"valid_to" date,
	"min_pax" integer,
	"max_pax" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_services" (
	"id" text PRIMARY KEY NOT NULL,
	"supplier_id" text NOT NULL,
	"service_type" "service_type" NOT NULL,
	"facility_id" text,
	"name" text NOT NULL,
	"description" text,
	"duration" text,
	"capacity" integer,
	"active" boolean DEFAULT true NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" "supplier_type" NOT NULL,
	"status" "supplier_status" DEFAULT 'active' NOT NULL,
	"description" text,
	"default_currency" text,
	"payment_terms_days" integer,
	"reservation_timeout_minutes" integer,
	"primary_facility_id" text,
	"customer_payment_policy" jsonb,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_item_product_details" (
	"booking_item_id" text PRIMARY KEY NOT NULL,
	"product_id" text,
	"option_id" text,
	"unit_id" text,
	"supplier_service_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_product_details" (
	"booking_id" text PRIMARY KEY NOT NULL,
	"product_id" text,
	"option_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products_sourced_content" (
	"entity_id" text NOT NULL,
	"locale" text NOT NULL,
	"market" text DEFAULT '*' NOT NULL,
	"payload" jsonb NOT NULL,
	"content_schema_version" text NOT NULL,
	"returned_locale" text NOT NULL,
	"machine_translated" boolean DEFAULT false NOT NULL,
	"source_updated_at" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"fresh_until" timestamp with time zone,
	"etag" text,
	"fetch_status" text DEFAULT 'ok' NOT NULL,
	"fetch_error" text,
	CONSTRAINT "products_sourced_content_entity_id_locale_market_pk" PRIMARY KEY("entity_id","locale","market")
);
--> statement-breakpoint
CREATE TABLE "extras_sourced_content" (
	"entity_id" text NOT NULL,
	"locale" text NOT NULL,
	"market" text DEFAULT '*' NOT NULL,
	"payload" jsonb NOT NULL,
	"content_schema_version" text NOT NULL,
	"returned_locale" text NOT NULL,
	"machine_translated" boolean DEFAULT false NOT NULL,
	"source_updated_at" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"fresh_until" timestamp with time zone,
	"etag" text,
	"fetch_status" text DEFAULT 'ok' NOT NULL,
	"fetch_error" text,
	CONSTRAINT "extras_sourced_content_entity_id_locale_market_pk" PRIMARY KEY("entity_id","locale","market")
);
--> statement-breakpoint
CREATE TABLE "option_extra_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"option_id" text NOT NULL,
	"product_extra_id" text NOT NULL,
	"selection_type" "extra_selection_type",
	"pricing_mode" "extra_pricing_mode",
	"priced_per_person" boolean,
	"min_quantity" integer,
	"max_quantity" integer,
	"default_quantity" integer,
	"is_default" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_extras" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"supplier_id" text,
	"code" text,
	"name" text NOT NULL,
	"description" text,
	"selection_type" "extra_selection_type" DEFAULT 'optional' NOT NULL,
	"pricing_mode" "extra_pricing_mode" DEFAULT 'per_booking' NOT NULL,
	"priced_per_person" boolean DEFAULT false NOT NULL,
	"collection_mode" "extra_collection_mode" DEFAULT 'booking_total' NOT NULL,
	"show_on_slot_manifest" boolean DEFAULT true NOT NULL,
	"min_quantity" integer,
	"max_quantity" integer,
	"default_quantity" integer,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "option_units" (
	"id" text PRIMARY KEY NOT NULL,
	"option_id" text NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"description" text,
	"unit_type" "option_unit_type" DEFAULT 'person' NOT NULL,
	"min_quantity" integer,
	"max_quantity" integer,
	"min_age" integer,
	"max_age" integer,
	"occupancy_min" integer,
	"occupancy_max" integer,
	"is_required" boolean DEFAULT false NOT NULL,
	"is_hidden" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_options" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"description" text,
	"status" "product_option_status" DEFAULT 'draft' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"available_from" date,
	"available_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_pax_pricing_tiers" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"option_unit_id" text,
	"tier_pax" integer NOT NULL,
	"price_per_pax_cents" integer NOT NULL,
	"promo_price_per_pax_cents" integer,
	"effective_from" date,
	"effective_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"status" "product_status" DEFAULT 'draft' NOT NULL,
	"description" text,
	"inclusions_html" text,
	"exclusions_html" text,
	"terms_html" text,
	"terms_show_on_contract" boolean DEFAULT false NOT NULL,
	"booking_mode" "product_booking_mode" DEFAULT 'date' NOT NULL,
	"capacity_mode" "product_capacity_mode" DEFAULT 'limited' NOT NULL,
	"timezone" text,
	"default_language_tag" text,
	"visibility" "product_visibility" DEFAULT 'private' NOT NULL,
	"activated" boolean DEFAULT false NOT NULL,
	"reservation_timeout_minutes" integer,
	"sell_currency" text NOT NULL,
	"sell_amount_cents" integer,
	"cost_amount_cents" integer,
	"margin_percent" integer,
	"facility_id" text,
	"supplier_id" text,
	"start_date" date,
	"end_date" date,
	"pax" integer,
	"product_type_id" text,
	"contract_template_id" text,
	"tax_class_id" text,
	"customer_payment_policy" jsonb,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_day_services" (
	"id" text PRIMARY KEY NOT NULL,
	"day_id" text NOT NULL,
	"supplier_service_id" text,
	"service_type" "service_type" NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"country_code" text,
	"cost_currency" text NOT NULL,
	"cost_amount_cents" integer NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"sort_order" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_day_translations" (
	"id" text PRIMARY KEY NOT NULL,
	"day_id" text NOT NULL,
	"language_tag" text NOT NULL,
	"title" text,
	"description" text,
	"location" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_days" (
	"id" text PRIMARY KEY NOT NULL,
	"itinerary_id" text NOT NULL,
	"day_number" integer NOT NULL,
	"title" text,
	"description" text,
	"location" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_itineraries" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_media" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"day_id" text,
	"media_type" "product_media_type" NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"storage_key" text,
	"mime_type" text,
	"file_size" integer,
	"alt_text" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_cover" boolean DEFAULT false NOT NULL,
	"is_brochure" boolean DEFAULT false NOT NULL,
	"is_brochure_current" boolean DEFAULT false NOT NULL,
	"brochure_version" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"author_id" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"version_number" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"author_id" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "option_unit_translations" (
	"id" text PRIMARY KEY NOT NULL,
	"unit_id" text NOT NULL,
	"language_tag" text NOT NULL,
	"name" text NOT NULL,
	"short_description" text,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_activation_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"activation_mode" "product_activation_mode" DEFAULT 'manual' NOT NULL,
	"activate_at" timestamp with time zone,
	"deactivate_at" timestamp with time zone,
	"sell_at" timestamp with time zone,
	"stop_sell_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_capabilities" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"capability" "product_capability" NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_delivery_formats" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"format" "product_delivery_format" NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_faqs" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_features" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"feature_type" "product_feature_type" DEFAULT 'highlight' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_locations" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"location_type" "product_location_type" DEFAULT 'point_of_interest' NOT NULL,
	"title" text NOT NULL,
	"address" text,
	"city" text,
	"country_code" text,
	"latitude" double precision,
	"longitude" double precision,
	"google_place_id" text,
	"apple_place_id" text,
	"tripadvisor_location_id" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_option_translations" (
	"id" text PRIMARY KEY NOT NULL,
	"option_id" text NOT NULL,
	"language_tag" text NOT NULL,
	"name" text NOT NULL,
	"short_description" text,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_ticket_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"fulfillment_mode" "product_ticket_fulfillment" DEFAULT 'none' NOT NULL,
	"default_delivery_format" "product_delivery_format" DEFAULT 'none' NOT NULL,
	"ticket_per_unit" boolean DEFAULT false NOT NULL,
	"barcode_format" text,
	"voucher_message" text,
	"ticket_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_translations" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"language_tag" text NOT NULL,
	"slug" text,
	"name" text NOT NULL,
	"short_description" text,
	"description" text,
	"inclusions_html" text,
	"exclusions_html" text,
	"terms_html" text,
	"seo_title" text,
	"seo_description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_visibility_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"is_searchable" boolean DEFAULT false NOT NULL,
	"is_bookable" boolean DEFAULT false NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"requires_authentication" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "destination_translations" (
	"id" text PRIMARY KEY NOT NULL,
	"destination_id" text NOT NULL,
	"language_tag" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"seo_title" text,
	"seo_description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "destinations" (
	"id" text PRIMARY KEY NOT NULL,
	"parent_id" text,
	"slug" text NOT NULL,
	"code" text,
	"canonical_place_id" text,
	"destination_type" text DEFAULT 'destination' NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"parent_id" text,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"customer_payment_policy" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_category_products" (
	"product_id" text NOT NULL,
	"category_id" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_category_products_product_id_category_id_pk" PRIMARY KEY("product_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "product_category_translations" (
	"id" text PRIMARY KEY NOT NULL,
	"category_id" text NOT NULL,
	"language_tag" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"seo_title" text,
	"seo_description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_destinations" (
	"product_id" text NOT NULL,
	"destination_id" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_destinations_product_id_destination_id_pk" PRIMARY KEY("product_id","destination_id")
);
--> statement-breakpoint
CREATE TABLE "product_tag_products" (
	"product_id" text NOT NULL,
	"tag_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_tag_products_product_id_tag_id_pk" PRIMARY KEY("product_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "product_tag_translations" (
	"id" text PRIMARY KEY NOT NULL,
	"tag_id" text NOT NULL,
	"language_tag" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_tags" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_types" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exchange_rates" (
	"id" text PRIMARY KEY NOT NULL,
	"fx_rate_set_id" text NOT NULL,
	"base_currency" text NOT NULL,
	"quote_currency" text NOT NULL,
	"rate_decimal" numeric(18, 8) NOT NULL,
	"inverse_rate_decimal" numeric(18, 8),
	"observed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fx_rate_sets" (
	"id" text PRIMARY KEY NOT NULL,
	"source" "fx_rate_source" DEFAULT 'manual' NOT NULL,
	"base_currency" text NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	"observed_at" timestamp with time zone,
	"source_reference" text,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_channel_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"market_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"price_catalog_id" text,
	"visibility" "market_visibility" DEFAULT 'public' NOT NULL,
	"sellability" "market_sellability" DEFAULT 'sellable' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_currencies" (
	"id" text PRIMARY KEY NOT NULL,
	"market_id" text NOT NULL,
	"currency_code" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_settlement" boolean DEFAULT false NOT NULL,
	"is_reporting" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_locales" (
	"id" text PRIMARY KEY NOT NULL,
	"market_id" text NOT NULL,
	"language_tag" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_price_catalogs" (
	"id" text PRIMARY KEY NOT NULL,
	"market_id" text NOT NULL,
	"price_catalog_id" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_product_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"market_id" text NOT NULL,
	"product_id" text NOT NULL,
	"option_id" text,
	"price_catalog_id" text,
	"visibility" "market_visibility" DEFAULT 'public' NOT NULL,
	"sellability" "market_sellability" DEFAULT 'sellable' NOT NULL,
	"channel_scope" "market_channel_scope" DEFAULT 'all' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"available_from" date,
	"available_to" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "markets" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"status" "market_status" DEFAULT 'active' NOT NULL,
	"region_code" text,
	"country_code" text,
	"default_language_tag" text NOT NULL,
	"default_currency" text NOT NULL,
	"timezone" text,
	"tax_context" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_catalogs" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"currency_code" text,
	"catalog_type" "price_catalog_type" DEFAULT 'public' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_schedules" (
	"id" text PRIMARY KEY NOT NULL,
	"price_catalog_id" text NOT NULL,
	"code" text,
	"name" text NOT NULL,
	"recurrence_rule" text NOT NULL,
	"timezone" text,
	"valid_from" date,
	"valid_to" date,
	"weekdays" jsonb,
	"priority" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pricing_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text,
	"option_id" text,
	"unit_id" text,
	"code" text,
	"name" text NOT NULL,
	"category_type" "pricing_category_type" DEFAULT 'other' NOT NULL,
	"seat_occupancy" integer DEFAULT 1 NOT NULL,
	"group_size" integer,
	"is_age_qualified" boolean DEFAULT false NOT NULL,
	"min_age" integer,
	"max_age" integer,
	"internal_use_only" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pricing_category_dependencies" (
	"id" text PRIMARY KEY NOT NULL,
	"pricing_category_id" text NOT NULL,
	"master_pricing_category_id" text NOT NULL,
	"dependency_type" "pricing_dependency_type" DEFAULT 'requires' NOT NULL,
	"max_per_master" integer,
	"max_dependent_sum" integer,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "departure_price_overrides" (
	"id" text PRIMARY KEY NOT NULL,
	"departure_id" text NOT NULL,
	"option_id" text NOT NULL,
	"option_unit_id" text NOT NULL,
	"price_catalog_id" text NOT NULL,
	"sell_amount_cents" integer NOT NULL,
	"cost_amount_cents" integer,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dropoff_price_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"option_price_rule_id" text NOT NULL,
	"option_id" text NOT NULL,
	"facility_id" text,
	"dropoff_code" text,
	"dropoff_name" text NOT NULL,
	"pricing_mode" "addon_pricing_mode" DEFAULT 'included' NOT NULL,
	"sell_amount_cents" integer,
	"cost_amount_cents" integer,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extra_price_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"option_price_rule_id" text NOT NULL,
	"option_id" text NOT NULL,
	"product_extra_id" text,
	"option_extra_config_id" text,
	"pricing_mode" "addon_pricing_mode" DEFAULT 'included' NOT NULL,
	"sell_amount_cents" integer,
	"cost_amount_cents" integer,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "option_price_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"option_id" text NOT NULL,
	"price_catalog_id" text NOT NULL,
	"price_schedule_id" text,
	"cancellation_policy_id" text,
	"code" text,
	"name" text NOT NULL,
	"description" text,
	"pricing_mode" "option_pricing_mode" DEFAULT 'per_person' NOT NULL,
	"base_sell_amount_cents" integer,
	"base_cost_amount_cents" integer,
	"min_per_booking" integer,
	"max_per_booking" integer,
	"all_pricing_categories" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "option_start_time_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"option_price_rule_id" text NOT NULL,
	"option_id" text NOT NULL,
	"start_time_id" text NOT NULL,
	"rule_mode" "option_start_time_rule_mode" DEFAULT 'included' NOT NULL,
	"adjustment_type" "price_adjustment_type",
	"sell_adjustment_cents" integer,
	"cost_adjustment_cents" integer,
	"adjustment_basis_points" integer,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "option_unit_price_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"option_price_rule_id" text NOT NULL,
	"option_id" text NOT NULL,
	"unit_id" text NOT NULL,
	"pricing_category_id" text,
	"pricing_mode" "option_unit_pricing_mode" DEFAULT 'per_unit' NOT NULL,
	"sell_amount_cents" integer,
	"cost_amount_cents" integer,
	"min_quantity" integer,
	"max_quantity" integer,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "option_unit_tiers" (
	"id" text PRIMARY KEY NOT NULL,
	"option_unit_price_rule_id" text NOT NULL,
	"min_quantity" integer NOT NULL,
	"max_quantity" integer,
	"sell_amount_cents" integer,
	"cost_amount_cents" integer,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pickup_price_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"option_price_rule_id" text NOT NULL,
	"option_id" text NOT NULL,
	"pickup_point_id" text NOT NULL,
	"pricing_mode" "addon_pricing_mode" DEFAULT 'included' NOT NULL,
	"sell_amount_cents" integer,
	"cost_amount_cents" integer,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cancellation_policies" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text,
	"name" text NOT NULL,
	"policy_type" "cancellation_policy_type" DEFAULT 'custom' NOT NULL,
	"simple_cutoff_hours" integer,
	"is_default" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cancellation_policy_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"cancellation_policy_id" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"cutoff_minutes_before" integer,
	"charge_type" "cancellation_charge_type" DEFAULT 'none' NOT NULL,
	"charge_amount_cents" integer,
	"charge_percent_basis_points" integer,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promotional_offer_products" (
	"offer_id" text NOT NULL,
	"product_id" text NOT NULL,
	CONSTRAINT "promotional_offer_products_offer_id_product_id_pk" PRIMARY KEY("offer_id","product_id")
);
--> statement-breakpoint
CREATE TABLE "promotional_offer_redemptions" (
	"id" text PRIMARY KEY NOT NULL,
	"offer_id" text NOT NULL,
	"booking_id" text NOT NULL,
	"code_used" text,
	"discount_applied_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"redeemed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promotional_offer_scheduler_state" (
	"id" text PRIMARY KEY NOT NULL,
	"singleton_key" text DEFAULT 'singleton' NOT NULL,
	"last_tick" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promotional_offers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"discount_type" "promotional_offer_discount_type" NOT NULL,
	"discount_percent" numeric(5, 2),
	"discount_amount_cents" integer,
	"currency" text,
	"scope" jsonb NOT NULL,
	"conditions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"valid_from" timestamp with time zone,
	"valid_until" timestamp with time zone,
	"code" text,
	"stackable" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offer_expiration_events" (
	"id" text PRIMARY KEY NOT NULL,
	"offer_id" text NOT NULL,
	"snapshot_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"expired_at" timestamp with time zone,
	"status" "offer_expiration_event_status" DEFAULT 'scheduled' NOT NULL,
	"reason" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offer_refresh_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"offer_id" text NOT NULL,
	"snapshot_id" text,
	"status" "offer_refresh_run_status" DEFAULT 'pending' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sellability_explanations" (
	"id" text PRIMARY KEY NOT NULL,
	"snapshot_id" text NOT NULL,
	"snapshot_item_id" text,
	"candidate_index" integer DEFAULT 0 NOT NULL,
	"explanation_type" "sellability_explanation_type" DEFAULT 'policy' NOT NULL,
	"code" text,
	"message" text NOT NULL,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sellability_policies" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"scope" "sellability_policy_scope" DEFAULT 'global' NOT NULL,
	"policy_type" "sellability_policy_type" DEFAULT 'custom' NOT NULL,
	"product_id" text,
	"option_id" text,
	"market_id" text,
	"channel_id" text,
	"priority" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"conditions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"effects" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sellability_policy_results" (
	"id" text PRIMARY KEY NOT NULL,
	"snapshot_id" text NOT NULL,
	"snapshot_item_id" text,
	"policy_id" text,
	"candidate_index" integer DEFAULT 0 NOT NULL,
	"status" "sellability_policy_result_status" DEFAULT 'passed' NOT NULL,
	"message" text,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sellability_snapshot_items" (
	"id" text PRIMARY KEY NOT NULL,
	"snapshot_id" text NOT NULL,
	"candidate_index" integer DEFAULT 0 NOT NULL,
	"component_index" integer DEFAULT 0 NOT NULL,
	"product_id" text,
	"option_id" text,
	"slot_id" text,
	"unit_id" text,
	"request_ref" text,
	"component_kind" "sellability_snapshot_component_kind" NOT NULL,
	"title" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"pricing_mode" text NOT NULL,
	"pricing_category_id" text,
	"pricing_category_name" text,
	"unit_name" text,
	"unit_type" text,
	"currency_code" text NOT NULL,
	"sell_amount_cents" integer DEFAULT 0 NOT NULL,
	"cost_amount_cents" integer DEFAULT 0 NOT NULL,
	"source_rule_id" text,
	"tier_id" text,
	"is_selected" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sellability_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"offer_id" text,
	"market_id" text,
	"channel_id" text,
	"product_id" text,
	"option_id" text,
	"slot_id" text,
	"requested_currency_code" text,
	"source_currency_code" text,
	"fx_rate_set_id" text,
	"status" "sellability_snapshot_status" DEFAULT 'resolved' NOT NULL,
	"query_payload" jsonb NOT NULL,
	"pricing_summary" jsonb NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_catalog_snapshot" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"entity_module" text NOT NULL,
	"entity_id" text NOT NULL,
	"source_kind" text NOT NULL,
	"source_provider" text,
	"source_connection_id" text,
	"source_ref" text,
	"frozen_payload" jsonb NOT NULL,
	"overlay_state_at_capture" jsonb,
	"pricing_base_amount" numeric(18, 4),
	"pricing_taxes" numeric(18, 4),
	"pricing_fees" numeric(18, 4),
	"pricing_surcharges" numeric(18, 4),
	"pricing_currency" text,
	"pricing_breakdown" jsonb,
	"pricing_applied_offers" jsonb,
	"idempotency_key" text,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_drafts" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_module" text NOT NULL,
	"entity_id" text NOT NULL,
	"source_kind" text NOT NULL,
	"source_connection_id" text,
	"source_ref" text,
	"draft_payload" jsonb NOT NULL,
	"current_step" text,
	"current_quote_id" text,
	"hold_expires_at" timestamp with time zone,
	"consumed_booking_id" text,
	"consumed_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_overlay" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_module" text NOT NULL,
	"entity_id" text NOT NULL,
	"field_path" text NOT NULL,
	"locale" text DEFAULT 'default' NOT NULL,
	"audience" text DEFAULT 'default' NOT NULL,
	"market" text DEFAULT 'default' NOT NULL,
	"value" jsonb NOT NULL,
	"origin" jsonb NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_quotes" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_module" text NOT NULL,
	"entity_id" text NOT NULL,
	"source_kind" text NOT NULL,
	"source_provider" text,
	"source_connection_id" text,
	"source_ref" text,
	"available" boolean NOT NULL,
	"invalid_reason" text,
	"locale" text NOT NULL,
	"audience" text NOT NULL,
	"market" text NOT NULL,
	"currency" text,
	"pricing_base_amount" numeric(18, 4),
	"pricing_taxes" numeric(18, 4),
	"pricing_fees" numeric(18, 4),
	"pricing_surcharges" numeric(18, 4),
	"pricing_currency" text,
	"pricing_breakdown" jsonb,
	"pricing_applied_offers" jsonb,
	"upstream_payload" jsonb,
	"consumed_at" timestamp with time zone,
	"consumed_booking_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_sourced_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_module" text NOT NULL,
	"entity_id" text NOT NULL,
	"source_kind" text NOT NULL,
	"source_provider" text,
	"source_connection_id" text,
	"source_ref" text,
	"source_freshness" text NOT NULL,
	"last_sourced_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"projection" jsonb NOT NULL,
	"projection_etag" text,
	"projection_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_extras" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"product_extra_id" text,
	"option_extra_config_id" text,
	"name" text NOT NULL,
	"description" text,
	"status" "booking_extra_status" DEFAULT 'draft' NOT NULL,
	"pricing_mode" "extra_pricing_mode" DEFAULT 'per_booking' NOT NULL,
	"priced_per_person" boolean DEFAULT false NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"sell_currency" text NOT NULL,
	"unit_sell_amount_cents" integer,
	"total_sell_amount_cents" integer,
	"cost_currency" text,
	"unit_cost_amount_cents" integer,
	"total_cost_amount_cents" integer,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extra_participant_selections" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"booking_item_id" text,
	"traveler_id" text NOT NULL,
	"product_extra_id" text NOT NULL,
	"option_extra_config_id" text,
	"status" "extra_participant_selection_status" DEFAULT 'selected' NOT NULL,
	"collection_mode" "extra_collection_mode" DEFAULT 'booking_total' NOT NULL,
	"collection_status" "extra_collection_status" DEFAULT 'not_required' NOT NULL,
	"collection_currency" text,
	"collection_amount_cents" integer,
	"collected_at" timestamp with time zone,
	"collected_by" text,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_answers" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"product_booking_question_id" text NOT NULL,
	"booking_traveler_id" text,
	"booking_extra_id" text,
	"target" "booking_answer_target" DEFAULT 'booking' NOT NULL,
	"value_text" text,
	"value_number" integer,
	"value_boolean" boolean,
	"value_json" jsonb,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_question_extra_triggers" (
	"id" text PRIMARY KEY NOT NULL,
	"product_booking_question_id" text NOT NULL,
	"product_extra_id" text,
	"option_extra_config_id" text,
	"trigger_mode" "booking_question_trigger_mode" DEFAULT 'required' NOT NULL,
	"min_quantity" integer,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_question_option_triggers" (
	"id" text PRIMARY KEY NOT NULL,
	"product_booking_question_id" text NOT NULL,
	"option_id" text NOT NULL,
	"trigger_mode" "booking_question_trigger_mode" DEFAULT 'required' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_question_options" (
	"id" text PRIMARY KEY NOT NULL,
	"product_booking_question_id" text NOT NULL,
	"value" text NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_question_unit_triggers" (
	"id" text PRIMARY KEY NOT NULL,
	"product_booking_question_id" text NOT NULL,
	"unit_id" text NOT NULL,
	"trigger_mode" "booking_question_trigger_mode" DEFAULT 'required' NOT NULL,
	"min_quantity" integer,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "option_booking_questions" (
	"id" text PRIMARY KEY NOT NULL,
	"option_id" text NOT NULL,
	"product_booking_question_id" text NOT NULL,
	"is_required_override" boolean,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_booking_questions" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"code" text,
	"label" text NOT NULL,
	"description" text,
	"target" "booking_question_target" DEFAULT 'booking' NOT NULL,
	"field_type" "booking_question_field_type" DEFAULT 'text' NOT NULL,
	"placeholder" text,
	"help_text" text,
	"is_required" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_contact_requirements" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"option_id" text,
	"field_key" "contact_requirement_field" NOT NULL,
	"scope" "contact_requirement_scope" DEFAULT 'traveler' NOT NULL,
	"is_required" boolean DEFAULT false NOT NULL,
	"per_traveler" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_traveler_travel_details" (
	"traveler_id" text PRIMARY KEY NOT NULL,
	"identity_encrypted" jsonb,
	"dietary_encrypted" jsonb,
	"accessibility_encrypted" jsonb,
	"document_person_document_id" text,
	"is_lead_traveler" boolean DEFAULT false NOT NULL,
	"sharing_group_id" text,
	"room_type_id" text,
	"bed_preference" text,
	"allocations" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_pii_access_log" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text,
	"traveler_id" text,
	"actor_id" text,
	"actor_type" text,
	"caller_type" text,
	"action" "booking_pii_access_action" NOT NULL,
	"outcome" "booking_pii_access_outcome" NOT NULL,
	"reason" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_travelers" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"person_id" text,
	"participant_type" "booking_participant_type" DEFAULT 'traveler' NOT NULL,
	"traveler_category" "booking_traveler_category",
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text,
	"phone" text,
	"preferred_language" text,
	"special_requests" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_number" text NOT NULL,
	"status" "booking_status" DEFAULT 'draft' NOT NULL,
	"person_id" text,
	"organization_id" text,
	"source_type" "booking_source_type" DEFAULT 'manual' NOT NULL,
	"external_booking_ref" text,
	"communication_language" text,
	"contact_first_name" text,
	"contact_last_name" text,
	"contact_party_type" text,
	"contact_tax_id" text,
	"contact_email" text,
	"contact_phone" text,
	"contact_preferred_language" text,
	"contact_country" text,
	"contact_region" text,
	"contact_city" text,
	"contact_address_line1" text,
	"contact_address_line2" text,
	"contact_postal_code" text,
	"sell_currency" text NOT NULL,
	"base_currency" text,
	"fx_rate_set_id" text,
	"sell_amount_cents" integer,
	"base_sell_amount_cents" integer,
	"cost_amount_cents" integer,
	"base_cost_amount_cents" integer,
	"margin_percent" integer,
	"start_date" date,
	"end_date" date,
	"pax" integer,
	"internal_notes" text,
	"customer_payment_policy" jsonb,
	"price_override" jsonb,
	"hold_expires_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"expired_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"awaiting_payment_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"redeemed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_booking_number_unique" UNIQUE("booking_number"),
	CONSTRAINT "ck_bookings_base_currency_amounts" CHECK (("bookings"."base_sell_amount_cents" IS NULL AND "bookings"."base_cost_amount_cents" IS NULL) OR "bookings"."base_currency" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "booking_group_members" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"booking_id" text NOT NULL,
	"role" "booking_group_member_role" DEFAULT 'shared' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" "booking_group_kind" DEFAULT 'shared_room' NOT NULL,
	"label" text NOT NULL,
	"primary_booking_id" text,
	"product_id" text,
	"option_unit_id" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_allocations" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"booking_item_id" text NOT NULL,
	"product_id" text,
	"option_id" text,
	"option_unit_id" text,
	"pricing_category_id" text,
	"availability_slot_id" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"allocation_type" "booking_allocation_type" DEFAULT 'unit' NOT NULL,
	"status" "booking_allocation_status" DEFAULT 'held' NOT NULL,
	"hold_expires_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"released_at" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_fulfillments" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"booking_item_id" text,
	"traveler_id" text,
	"fulfillment_type" "booking_fulfillment_type" NOT NULL,
	"delivery_channel" "booking_fulfillment_delivery_channel" NOT NULL,
	"status" "booking_fulfillment_status" DEFAULT 'pending' NOT NULL,
	"artifact_url" text,
	"payload" jsonb,
	"issued_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_item_travelers" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_item_id" text NOT NULL,
	"traveler_id" text NOT NULL,
	"role" "booking_item_participant_role" DEFAULT 'traveler' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_items" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"item_type" "booking_item_type" DEFAULT 'unit' NOT NULL,
	"status" "booking_item_status" DEFAULT 'draft' NOT NULL,
	"service_date" date,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"quantity" integer DEFAULT 1 NOT NULL,
	"sell_currency" text NOT NULL,
	"unit_sell_amount_cents" integer,
	"total_sell_amount_cents" integer,
	"cost_currency" text,
	"unit_cost_amount_cents" integer,
	"total_cost_amount_cents" integer,
	"notes" text,
	"product_id" text,
	"option_id" text,
	"option_unit_id" text,
	"pricing_category_id" text,
	"availability_slot_id" text,
	"product_name_snapshot" text,
	"option_name_snapshot" text,
	"unit_name_snapshot" text,
	"departure_label_snapshot" text,
	"source_snapshot_id" text,
	"source_offer_id" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_booking_items_cost_currency_amounts" CHECK (("booking_items"."unit_cost_amount_cents" IS NULL AND "booking_items"."total_cost_amount_cents" IS NULL) OR "booking_items"."cost_currency" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "booking_redemption_events" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"booking_item_id" text,
	"traveler_id" text,
	"redeemed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"redeemed_by" text,
	"location" text,
	"method" "booking_redemption_method" DEFAULT 'manual' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_activity_log" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"actor_id" text,
	"activity_type" "booking_activity_type" NOT NULL,
	"description" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"traveler_id" text,
	"type" "booking_document_type" NOT NULL,
	"file_name" text NOT NULL,
	"file_url" text NOT NULL,
	"expires_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"author_id" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_session_states" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"state_key" text DEFAULT 'wizard' NOT NULL,
	"current_step" text,
	"completed_steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"payload" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_supplier_statuses" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"supplier_service_id" text,
	"supplier_id" text,
	"service_name" text NOT NULL,
	"status" "supplier_confirmation_status" DEFAULT 'pending' NOT NULL,
	"supplier_reference" text,
	"cost_currency" text NOT NULL,
	"cost_amount_cents" integer NOT NULL,
	"supplier_invoice_line_id" text,
	"notes" text,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_origins" (
	"booking_id" text PRIMARY KEY NOT NULL,
	"origin_source" text DEFAULT 'manual' NOT NULL,
	"proposal_version_id" text,
	"trip_snapshot_id" text,
	"reservation_plan_id" text,
	"catalog_price_response_id" text,
	"catalog_snapshot_id" text,
	"provider_source_kind" text,
	"provider_source_provider" text,
	"provider_source_connection_id" text,
	"provider_source_ref" text,
	"provider_order_ref" text,
	"legacy_transaction_offer_id" text,
	"legacy_transaction_order_id" text,
	"legacy_transaction_ids" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_booking_origins_source" CHECK ("booking_origins"."origin_source" IN ('manual', 'direct_b2c', 'accepted_proposal_version', 'catalog_price_availability', 'catalog_snapshot', 'provider_source_order', 'legacy_transaction'))
);
--> statement-breakpoint
CREATE TABLE "booking_staff_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"booking_item_id" text,
	"person_id" text,
	"role" "booking_staff_assignment_role" DEFAULT 'service_assignee' NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text,
	"phone" text,
	"preferred_language" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_guarantees" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"booking_payment_schedule_id" text,
	"booking_item_id" text,
	"guarantee_type" "guarantee_type" NOT NULL,
	"status" "guarantee_status" DEFAULT 'pending' NOT NULL,
	"payment_instrument_id" text,
	"payment_authorization_id" text,
	"currency" text,
	"amount_cents" integer,
	"provider" text,
	"reference_number" text,
	"guaranteed_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"released_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_booking_guarantees_currency_amount" CHECK (("booking_guarantees"."currency" IS NULL) = ("booking_guarantees"."amount_cents" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "booking_item_commissions" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_item_id" text NOT NULL,
	"channel_id" text,
	"recipient_type" "commission_recipient_type" NOT NULL,
	"commission_model" "commission_model" DEFAULT 'percentage' NOT NULL,
	"currency" text,
	"amount_cents" integer,
	"rate_basis_points" integer,
	"status" "commission_status" DEFAULT 'pending' NOT NULL,
	"payable_at" date,
	"paid_at" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_booking_item_commissions_currency_amount" CHECK (("booking_item_commissions"."currency" IS NULL) = ("booking_item_commissions"."amount_cents" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "booking_item_tax_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_item_id" text NOT NULL,
	"code" text,
	"name" text NOT NULL,
	"jurisdiction" text,
	"scope" "tax_scope" DEFAULT 'excluded' NOT NULL,
	"currency" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"rate_basis_points" integer,
	"included_in_price" boolean DEFAULT false NOT NULL,
	"remittance_party" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_payment_schedules" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"booking_item_id" text,
	"schedule_type" "payment_schedule_type" DEFAULT 'balance' NOT NULL,
	"status" "payment_schedule_status" DEFAULT 'pending' NOT NULL,
	"due_date" date NOT NULL,
	"currency" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_id" text NOT NULL,
	"author_id" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_id" text NOT NULL,
	"kind" text DEFAULT 'supporting_document' NOT NULL,
	"name" text NOT NULL,
	"mime_type" text,
	"file_size" integer,
	"storage_key" text,
	"checksum" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_external_refs" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_id" text NOT NULL,
	"provider" text NOT NULL,
	"external_id" text,
	"external_number" text,
	"external_url" text,
	"status" text,
	"metadata" jsonb,
	"synced_at" timestamp with time zone,
	"sync_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_number_series" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"prefix" text DEFAULT '' NOT NULL,
	"separator" text DEFAULT '' NOT NULL,
	"pad_length" integer DEFAULT 4 NOT NULL,
	"current_sequence" integer DEFAULT 0 NOT NULL,
	"reset_strategy" "invoice_number_reset_strategy" DEFAULT 'never' NOT NULL,
	"reset_at" timestamp with time zone,
	"scope" "invoice_number_series_scope" DEFAULT 'invoice' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"external_provider" text,
	"external_config_key" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_number_series_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "invoice_renditions" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_id" text NOT NULL,
	"template_id" text,
	"format" "invoice_rendition_format" DEFAULT 'pdf' NOT NULL,
	"status" "invoice_rendition_status" DEFAULT 'pending' NOT NULL,
	"storage_key" text,
	"file_size" integer,
	"checksum" text,
	"language" text,
	"error_message" text,
	"generated_at" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"jurisdiction" text,
	"body_format" "invoice_template_body_format" DEFAULT 'html' NOT NULL,
	"body" text NOT NULL,
	"css_styles" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_templates_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "payment_instruments" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_type" "payment_instrument_owner_type" DEFAULT 'client' NOT NULL,
	"person_id" text,
	"organization_id" text,
	"supplier_id" text,
	"channel_id" text,
	"instrument_type" "payment_instrument_type" NOT NULL,
	"status" "payment_instrument_status" DEFAULT 'active' NOT NULL,
	"label" text NOT NULL,
	"provider" text,
	"brand" text,
	"last4" text,
	"holder_name" text,
	"expiry_month" integer,
	"expiry_year" integer,
	"external_token" text,
	"external_customer_id" text,
	"billing_email" text,
	"billing_address" text,
	"direct_bill_reference" text,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_authorizations" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text,
	"order_id" text,
	"invoice_id" text,
	"booking_guarantee_id" text,
	"payment_instrument_id" text,
	"status" "payment_authorization_status" DEFAULT 'pending' NOT NULL,
	"capture_mode" "capture_mode" DEFAULT 'manual' NOT NULL,
	"currency" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"provider" text,
	"external_authorization_id" text,
	"approval_code" text,
	"authorized_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"voided_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_captures" (
	"id" text PRIMARY KEY NOT NULL,
	"payment_authorization_id" text,
	"invoice_id" text,
	"status" "payment_capture_status" DEFAULT 'pending' NOT NULL,
	"currency" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"provider" text,
	"external_capture_id" text,
	"captured_at" timestamp with time zone,
	"settled_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"target_type" "payment_session_target_type" DEFAULT 'other' NOT NULL,
	"target_id" text,
	"booking_id" text,
	"order_id" text,
	"invoice_id" text,
	"booking_payment_schedule_id" text,
	"booking_guarantee_id" text,
	"payment_instrument_id" text,
	"payment_authorization_id" text,
	"payment_capture_id" text,
	"payment_id" text,
	"status" "payment_session_status" DEFAULT 'pending' NOT NULL,
	"provider" text,
	"provider_session_id" text,
	"provider_payment_id" text,
	"external_reference" text,
	"idempotency_key" text,
	"client_reference" text,
	"currency" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"payment_method" "payment_method",
	"payer_person_id" text,
	"payer_organization_id" text,
	"payer_email" text,
	"payer_name" text,
	"redirect_url" text,
	"return_url" text,
	"cancel_url" text,
	"callback_url" text,
	"expires_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"expired_at" timestamp with time zone,
	"failure_code" text,
	"failure_message" text,
	"notes" text,
	"provider_payload" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_note_line_items" (
	"id" text PRIMARY KEY NOT NULL,
	"credit_note_id" text NOT NULL,
	"description" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"total_cents" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"credit_note_number" text NOT NULL,
	"invoice_id" text NOT NULL,
	"status" "credit_note_status" DEFAULT 'draft' NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"base_currency" text,
	"base_amount_cents" integer,
	"fx_rate_set_id" text,
	"reason" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_notes_credit_note_number_unique" UNIQUE("credit_note_number")
);
--> statement-breakpoint
CREATE TABLE "invoice_line_items" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_id" text NOT NULL,
	"booking_item_id" text,
	"booking_payment_schedule_id" text,
	"description" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"total_cents" integer NOT NULL,
	"tax_rate" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_number" text NOT NULL,
	"invoice_type" "invoice_type" DEFAULT 'invoice' NOT NULL,
	"converted_from_invoice_id" text,
	"series_id" text,
	"sequence" integer,
	"template_id" text,
	"tax_regime_id" text,
	"language" text,
	"booking_id" text NOT NULL,
	"person_id" text,
	"organization_id" text,
	"status" "invoice_status" DEFAULT 'draft' NOT NULL,
	"currency" text NOT NULL,
	"base_currency" text,
	"fx_rate_set_id" text,
	"subtotal_cents" integer DEFAULT 0 NOT NULL,
	"base_subtotal_cents" integer,
	"tax_cents" integer DEFAULT 0 NOT NULL,
	"base_tax_cents" integer,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"base_total_cents" integer,
	"paid_cents" integer DEFAULT 0 NOT NULL,
	"base_paid_cents" integer,
	"balance_due_cents" integer DEFAULT 0 NOT NULL,
	"base_balance_due_cents" integer,
	"commission_percent" integer,
	"commission_amount_cents" integer,
	"issue_date" date NOT NULL,
	"due_date" date NOT NULL,
	"notes" text,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_invoices_base_currency_amounts" CHECK ((
        "invoices"."base_subtotal_cents" IS NULL
        AND "invoices"."base_tax_cents" IS NULL
        AND "invoices"."base_total_cents" IS NULL
        AND "invoices"."base_paid_cents" IS NULL
        AND "invoices"."base_balance_due_cents" IS NULL
      ) OR "invoices"."base_currency" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"base_currency" text,
	"base_amount_cents" integer,
	"fx_rate_set_id" text,
	"payment_method" "payment_method" NOT NULL,
	"payment_instrument_id" text,
	"payment_authorization_id" text,
	"payment_capture_id" text,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"reference_number" text,
	"payment_date" date NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_payments_base_currency_amount" CHECK (("payments"."base_currency" IS NULL) = ("payments"."base_amount_cents" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "cost_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_cost_allocations" (
	"id" text PRIMARY KEY NOT NULL,
	"supplier_invoice_id" text NOT NULL,
	"supplier_invoice_line_id" text,
	"target_type" "cost_allocation_target_type" NOT NULL,
	"departure_id" text,
	"product_id" text,
	"booking_id" text,
	"booking_item_id" text,
	"traveler_id" text,
	"amount_cents" integer NOT NULL,
	"base_amount_cents" integer,
	"split_method" "cost_allocation_split_method" DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_supplier_cost_allocations_one_target" CHECK ((
        ("supplier_cost_allocations"."target_type" = 'departure' AND "supplier_cost_allocations"."departure_id" IS NOT NULL AND "supplier_cost_allocations"."product_id" IS NULL AND "supplier_cost_allocations"."booking_id" IS NULL AND "supplier_cost_allocations"."booking_item_id" IS NULL AND "supplier_cost_allocations"."traveler_id" IS NULL)
        OR ("supplier_cost_allocations"."target_type" = 'product' AND "supplier_cost_allocations"."product_id" IS NOT NULL AND "supplier_cost_allocations"."departure_id" IS NULL AND "supplier_cost_allocations"."booking_id" IS NULL AND "supplier_cost_allocations"."booking_item_id" IS NULL AND "supplier_cost_allocations"."traveler_id" IS NULL)
        OR ("supplier_cost_allocations"."target_type" = 'booking' AND "supplier_cost_allocations"."booking_id" IS NOT NULL AND "supplier_cost_allocations"."departure_id" IS NULL AND "supplier_cost_allocations"."product_id" IS NULL AND "supplier_cost_allocations"."traveler_id" IS NULL)
        OR ("supplier_cost_allocations"."target_type" = 'traveler' AND "supplier_cost_allocations"."traveler_id" IS NOT NULL AND "supplier_cost_allocations"."departure_id" IS NULL AND "supplier_cost_allocations"."product_id" IS NULL)
        OR ("supplier_cost_allocations"."target_type" = 'unattributed' AND "supplier_cost_allocations"."departure_id" IS NULL AND "supplier_cost_allocations"."product_id" IS NULL AND "supplier_cost_allocations"."booking_id" IS NULL AND "supplier_cost_allocations"."booking_item_id" IS NULL AND "supplier_cost_allocations"."traveler_id" IS NULL)
      ))
);
--> statement-breakpoint
CREATE TABLE "supplier_invoice_attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"supplier_invoice_id" text NOT NULL,
	"kind" text DEFAULT 'supporting_document' NOT NULL,
	"name" text NOT NULL,
	"mime_type" text,
	"file_size" integer,
	"storage_key" text,
	"checksum" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_invoice_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"supplier_invoice_id" text NOT NULL,
	"description" text NOT NULL,
	"service_type" "ap_service_type" DEFAULT 'other' NOT NULL,
	"cost_category_id" text,
	"supplier_service_id" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_amount_cents" integer NOT NULL,
	"tax_rate_bps" integer,
	"tax_amount_cents" integer DEFAULT 0 NOT NULL,
	"total_amount_cents" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"supplier_id" text NOT NULL,
	"supplier_invoice_no" text NOT NULL,
	"internal_ref" text,
	"status" "supplier_invoice_status" DEFAULT 'draft' NOT NULL,
	"currency" text NOT NULL,
	"base_currency" text,
	"fx_rate_set_id" text,
	"subtotal_cents" integer DEFAULT 0 NOT NULL,
	"tax_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"base_subtotal_cents" integer,
	"base_tax_cents" integer,
	"base_total_cents" integer,
	"paid_cents" integer DEFAULT 0 NOT NULL,
	"balance_due_cents" integer DEFAULT 0 NOT NULL,
	"tax_regime_id" text,
	"issue_date" date NOT NULL,
	"due_date" date,
	"received_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"approved_by" text,
	"storage_key" text,
	"extraction_id" text,
	"notes" text,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "ck_supplier_invoices_base_currency" CHECK ("supplier_invoices"."base_currency" IS NOT NULL OR "supplier_invoices"."fx_rate_set_id" IS NULL)
);
--> statement-breakpoint
CREATE TABLE "supplier_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text,
	"supplier_id" text,
	"booking_supplier_status_id" text,
	"supplier_invoice_id" text,
	"amount_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"base_currency" text,
	"base_amount_cents" integer,
	"fx_rate_set_id" text,
	"payment_method" "payment_method" NOT NULL,
	"payment_instrument_id" text,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"reference_number" text,
	"payment_date" date NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_supplier_payments_target" CHECK ("supplier_payments"."booking_id" IS NOT NULL OR "supplier_payments"."supplier_invoice_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "tax_classes" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"default_regime_id" text,
	"lines" jsonb,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tax_policy_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"jurisdiction" text,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tax_policy_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"profile_id" text NOT NULL,
	"side" "tax_policy_side" DEFAULT 'sell' NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"name" text NOT NULL,
	"applies_to" "tax_class_applies_to" DEFAULT 'all' NOT NULL,
	"condition" jsonb,
	"tax_regime_id" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tax_regimes" (
	"id" text PRIMARY KEY NOT NULL,
	"code" "tax_regime_code" NOT NULL,
	"name" text NOT NULL,
	"jurisdiction" text,
	"rate_percent" integer,
	"description" text,
	"legal_reference" text,
	"active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voucher_redemptions" (
	"id" text PRIMARY KEY NOT NULL,
	"voucher_id" text NOT NULL,
	"booking_id" text NOT NULL,
	"payment_id" text,
	"amount_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" text
);
--> statement-breakpoint
CREATE TABLE "vouchers" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"series_code" text,
	"status" "voucher_status" DEFAULT 'active' NOT NULL,
	"currency" text NOT NULL,
	"initial_amount_cents" integer NOT NULL,
	"remaining_amount_cents" integer NOT NULL,
	"issued_to_person_id" text,
	"issued_to_organization_id" text,
	"source_type" "voucher_source_type" NOT NULL,
	"source_booking_id" text,
	"source_payment_id" text,
	"valid_from" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"notes" text,
	"issued_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "allocation_audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"slot_id" text NOT NULL,
	"action" text NOT NULL,
	"actor_id" text,
	"traveler_id" text,
	"resource_id" text,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "allocation_resources" (
	"id" text PRIMARY KEY NOT NULL,
	"slot_id" text NOT NULL,
	"kind" text NOT NULL,
	"ref_type" text,
	"ref_id" text,
	"label" text,
	"capacity" integer NOT NULL,
	"flags" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"parent_id" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "availability_closeouts" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"slot_id" text,
	"date_local" date NOT NULL,
	"reason" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "availability_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"option_id" text,
	"facility_id" text,
	"timezone" text NOT NULL,
	"recurrence_rule" text NOT NULL,
	"max_capacity" integer NOT NULL,
	"max_pickup_capacity" integer,
	"min_total_pax" integer,
	"cutoff_minutes" integer,
	"early_booking_limit_minutes" integer,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "availability_slots" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"itinerary_id" text,
	"option_id" text,
	"facility_id" text,
	"availability_rule_id" text,
	"start_time_id" text,
	"date_local" date NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"timezone" text NOT NULL,
	"status" "availability_slot_status" DEFAULT 'open' NOT NULL,
	"unlimited" boolean DEFAULT false NOT NULL,
	"initial_pax" integer,
	"remaining_pax" integer,
	"initial_pickups" integer,
	"remaining_pickups" integer,
	"remaining_resources" integer,
	"past_cutoff" boolean DEFAULT false NOT NULL,
	"too_early" boolean DEFAULT false NOT NULL,
	"nights" integer,
	"days" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "availability_start_times" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"option_id" text,
	"facility_id" text,
	"label" text,
	"start_time_local" text NOT NULL,
	"duration_minutes" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_option_resource_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"product_option_id" text NOT NULL,
	"kind" text NOT NULL,
	"ref_type" text,
	"ref_id" text,
	"capacity" integer NOT NULL,
	"name_pattern" text NOT NULL,
	"layout" text,
	"default_count" integer,
	"flags" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sharing_group_labels" (
	"group_id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "availability_holds" (
	"id" text PRIMARY KEY NOT NULL,
	"draft_id" text NOT NULL,
	"hold_token" text NOT NULL,
	"product_id" text NOT NULL,
	"slot_id" text NOT NULL,
	"pax_count" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "availability_pickup_points" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"facility_id" text,
	"name" text NOT NULL,
	"description" text,
	"location_text" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "availability_slot_pickups" (
	"id" text PRIMARY KEY NOT NULL,
	"slot_id" text NOT NULL,
	"pickup_point_id" text NOT NULL,
	"initial_capacity" integer,
	"remaining_capacity" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_pickup_areas" (
	"id" text PRIMARY KEY NOT NULL,
	"meeting_config_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"geographic_text" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "location_pickup_times" (
	"id" text PRIMARY KEY NOT NULL,
	"pickup_location_id" text NOT NULL,
	"slot_id" text,
	"start_time_id" text,
	"timing_mode" "pickup_timing_mode" DEFAULT 'fixed_time' NOT NULL,
	"local_time" text,
	"offset_minutes" integer,
	"instructions" text,
	"initial_capacity" integer,
	"remaining_capacity" integer,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pickup_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"meeting_config_id" text NOT NULL,
	"kind" "pickup_group_kind" NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pickup_locations" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"facility_id" text,
	"name" text NOT NULL,
	"description" text,
	"location_text" text,
	"lead_time_minutes" integer,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_meeting_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"option_id" text,
	"facility_id" text,
	"mode" "meeting_mode" DEFAULT 'meeting_only' NOT NULL,
	"allow_custom_pickup" boolean DEFAULT false NOT NULL,
	"allow_custom_dropoff" boolean DEFAULT false NOT NULL,
	"requires_pickup_selection" boolean DEFAULT false NOT NULL,
	"requires_dropoff_selection" boolean DEFAULT false NOT NULL,
	"use_pickup_allotment" boolean DEFAULT false NOT NULL,
	"meeting_instructions" text,
	"pickup_instructions" text,
	"dropoff_instructions" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ground_dispatches" (
	"id" text PRIMARY KEY NOT NULL,
	"transfer_preference_id" text NOT NULL,
	"booking_id" text NOT NULL,
	"booking_item_id" text,
	"operator_id" text,
	"vehicle_id" text,
	"driver_id" text,
	"service_date" date,
	"scheduled_pickup_at" timestamp with time zone,
	"scheduled_dropoff_at" timestamp with time zone,
	"actual_pickup_at" timestamp with time zone,
	"actual_dropoff_at" timestamp with time zone,
	"status" "ground_dispatch_status" DEFAULT 'draft' NOT NULL,
	"passenger_count" integer,
	"checked_bags" integer,
	"carry_on_bags" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ground_transfer_preferences" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"booking_item_id" text,
	"pickup_facility_id" text,
	"dropoff_facility_id" text,
	"pickup_address_id" text,
	"dropoff_address_id" text,
	"requested_vehicle_category" "ground_vehicle_category",
	"requested_vehicle_class" "ground_vehicle_class",
	"service_level" "ground_service_level" DEFAULT 'private' NOT NULL,
	"passenger_count" integer,
	"checked_bags" integer,
	"carry_on_bags" integer,
	"wheelchair_count" integer,
	"child_seat_count" integer,
	"driver_language" text,
	"meet_and_greet" boolean DEFAULT false NOT NULL,
	"accessibility_notes" text,
	"pickup_notes" text,
	"dropoff_notes" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ground_dispatch_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"dispatch_id" text NOT NULL,
	"operator_id" text,
	"vehicle_id" text,
	"driver_id" text,
	"assignment_source" "ground_assignment_source" DEFAULT 'manual' NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ground_dispatch_checkpoints" (
	"id" text PRIMARY KEY NOT NULL,
	"dispatch_id" text NOT NULL,
	"sequence" integer DEFAULT 0 NOT NULL,
	"checkpoint_type" text NOT NULL,
	"status" "ground_checkpoint_status" DEFAULT 'pending' NOT NULL,
	"planned_at" timestamp with time zone,
	"actual_at" timestamp with time zone,
	"facility_id" text,
	"address_id" text,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ground_dispatch_legs" (
	"id" text PRIMARY KEY NOT NULL,
	"dispatch_id" text NOT NULL,
	"sequence" integer DEFAULT 0 NOT NULL,
	"leg_type" "ground_dispatch_leg_type" DEFAULT 'pickup' NOT NULL,
	"facility_id" text,
	"address_id" text,
	"scheduled_at" timestamp with time zone,
	"actual_at" timestamp with time zone,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ground_dispatch_passengers" (
	"id" text PRIMARY KEY NOT NULL,
	"dispatch_id" text NOT NULL,
	"participant_id" text,
	"display_name" text,
	"seat_label" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ground_driver_shifts" (
	"id" text PRIMARY KEY NOT NULL,
	"driver_id" text NOT NULL,
	"operator_id" text,
	"facility_id" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" "ground_driver_shift_status" DEFAULT 'scheduled' NOT NULL,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ground_execution_events" (
	"id" text PRIMARY KEY NOT NULL,
	"dispatch_id" text NOT NULL,
	"event_type" "ground_execution_event_type" DEFAULT 'note' NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"facility_id" text,
	"address_id" text,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ground_service_incidents" (
	"id" text PRIMARY KEY NOT NULL,
	"dispatch_id" text NOT NULL,
	"severity" "ground_incident_severity" DEFAULT 'warning' NOT NULL,
	"incident_type" text NOT NULL,
	"resolution_status" "ground_incident_resolution_status" DEFAULT 'open' NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ground_drivers" (
	"id" text PRIMARY KEY NOT NULL,
	"resource_id" text NOT NULL,
	"operator_id" text,
	"license_number" text,
	"spoken_languages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_guide" boolean DEFAULT false NOT NULL,
	"is_meet_and_greet_capable" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ground_operators" (
	"id" text PRIMARY KEY NOT NULL,
	"supplier_id" text,
	"facility_id" text,
	"name" text NOT NULL,
	"code" text,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ground_vehicles" (
	"id" text PRIMARY KEY NOT NULL,
	"resource_id" text NOT NULL,
	"operator_id" text,
	"category" "ground_vehicle_category" DEFAULT 'other' NOT NULL,
	"vehicle_class" "ground_vehicle_class" DEFAULT 'standard' NOT NULL,
	"passenger_capacity" integer,
	"checked_bag_capacity" integer,
	"carry_on_capacity" integer,
	"wheelchair_capacity" integer,
	"child_seat_capacity" integer,
	"is_accessible" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "facilities" (
	"id" text PRIMARY KEY NOT NULL,
	"parent_facility_id" text,
	"owner_type" "facility_owner_type",
	"owner_id" text,
	"kind" "facility_kind" NOT NULL,
	"status" "facility_status" DEFAULT 'active' NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"description" text,
	"timezone" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "facility_address_projections" (
	"facility_id" text PRIMARY KEY NOT NULL,
	"address_id" text,
	"full_text" text,
	"line1" text,
	"line2" text,
	"city" text,
	"region" text,
	"postal_code" text,
	"country" text,
	"latitude" double precision,
	"longitude" double precision,
	"address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "facility_features" (
	"id" text PRIMARY KEY NOT NULL,
	"facility_id" text NOT NULL,
	"category" "facility_feature_category" DEFAULT 'amenity' NOT NULL,
	"code" text,
	"name" text NOT NULL,
	"description" text,
	"value_text" text,
	"highlighted" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "facility_operation_schedules" (
	"id" text PRIMARY KEY NOT NULL,
	"facility_id" text NOT NULL,
	"day_of_week" "facility_day_of_week",
	"valid_from" date,
	"valid_to" date,
	"opens_at" text,
	"closes_at" text,
	"closed" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" text PRIMARY KEY NOT NULL,
	"facility_id" text NOT NULL,
	"property_type" "property_type" DEFAULT 'hotel' NOT NULL,
	"brand_name" text,
	"group_name" text,
	"rating" integer,
	"rating_scale" integer,
	"check_in_time" text,
	"check_out_time" text,
	"policy_notes" text,
	"amenity_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "property_group_members" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"property_id" text NOT NULL,
	"membership_role" "property_group_membership_role" DEFAULT 'member' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"valid_from" date,
	"valid_to" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "property_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"parent_group_id" text,
	"group_type" "property_group_type" DEFAULT 'chain' NOT NULL,
	"status" "property_group_status" DEFAULT 'active' NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"brand_name" text,
	"legal_name" text,
	"website" text,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resource_requirements" (
	"id" text PRIMARY KEY NOT NULL,
	"pool_id" text NOT NULL,
	"product_id" text NOT NULL,
	"availability_rule_id" text,
	"start_time_id" text,
	"quantity_required" integer DEFAULT 1 NOT NULL,
	"allocation_mode" "resource_allocation_mode" DEFAULT 'shared' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resource_closeouts" (
	"id" text PRIMARY KEY NOT NULL,
	"resource_id" text NOT NULL,
	"date_local" date NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"reason" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resource_pool_members" (
	"id" text PRIMARY KEY NOT NULL,
	"pool_id" text NOT NULL,
	"resource_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resource_pools" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text,
	"kind" "resource_kind" NOT NULL,
	"name" text NOT NULL,
	"shared_capacity" integer,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resource_slot_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"slot_id" text NOT NULL,
	"pool_id" text,
	"resource_id" text,
	"booking_id" text,
	"status" "resource_assignment_status" DEFAULT 'reserved' NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"assigned_by" text,
	"released_at" timestamp with time zone,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "resources" (
	"id" text PRIMARY KEY NOT NULL,
	"supplier_id" text,
	"facility_id" text,
	"kind" "resource_kind" NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"capacity" integer,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"template_id" text,
	"template_slug" text,
	"target_type" "notification_target_type" DEFAULT 'other' NOT NULL,
	"target_id" text,
	"person_id" text,
	"organization_id" text,
	"booking_id" text,
	"invoice_id" text,
	"payment_session_id" text,
	"channel" "notification_channel" NOT NULL,
	"provider" text NOT NULL,
	"provider_message_id" text,
	"status" "notification_delivery_status" DEFAULT 'pending' NOT NULL,
	"to_address" text NOT NULL,
	"from_address" text,
	"subject" text,
	"html_body" text,
	"text_body" text,
	"payload_data" jsonb,
	"metadata" jsonb,
	"error_message" text,
	"scheduled_for" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_reminder_rule_authoring_requests" (
	"idempotency_key" text PRIMARY KEY NOT NULL,
	"reminder_rule_id" text NOT NULL,
	"operation" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_reminder_rule_stages" (
	"id" text PRIMARY KEY NOT NULL,
	"reminder_rule_id" text NOT NULL,
	"order_index" integer NOT NULL,
	"name" text,
	"anchor" "notification_reminder_stage_anchor" NOT NULL,
	"window_start_days" integer NOT NULL,
	"window_end_days" integer NOT NULL,
	"cadence_kind" "notification_reminder_stage_cadence_kind" NOT NULL,
	"cadence_every_days" integer,
	"cadence_intervals" jsonb,
	"max_sends_in_stage" integer,
	"respect_quiet_hours" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_reminder_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"status" "notification_reminder_status" DEFAULT 'draft' NOT NULL,
	"target_type" "notification_reminder_target_type" NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"provider" text,
	"template_id" text,
	"template_slug" text,
	"priority" integer DEFAULT 0 NOT NULL,
	"suppression_group" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_reminder_rules_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "notification_reminder_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"reminder_rule_id" text NOT NULL,
	"target_type" "notification_reminder_target_type" NOT NULL,
	"target_id" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"booking_id" text,
	"person_id" text,
	"organization_id" text,
	"payment_session_id" text,
	"notification_delivery_id" text,
	"status" "notification_reminder_run_status" NOT NULL,
	"recipient" text,
	"scheduled_for" timestamp with time zone NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"error_message" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_reminder_runs_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "notification_reminder_stage_channels" (
	"id" text PRIMARY KEY NOT NULL,
	"stage_id" text NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"provider" text,
	"template_id" text,
	"template_slug" text,
	"recipient_kind" "notification_stage_recipient_kind" DEFAULT 'primary' NOT NULL,
	"recipient_role" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"scope" text DEFAULT 'default' NOT NULL,
	"quiet_hours_local" jsonb,
	"blackout_dates" jsonb,
	"skip_weekends" boolean DEFAULT false NOT NULL,
	"recipient_rate_limit_per_day" integer,
	"suppression_window_hours" integer DEFAULT 24 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"provider" text,
	"status" "notification_template_status" DEFAULT 'draft' NOT NULL,
	"subject_template" text,
	"html_template" text,
	"text_template" text,
	"from_address" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_templates_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "reference_aircraft" (
	"iata_code" text PRIMARY KEY NOT NULL,
	"icao_code" text,
	"name" text NOT NULL,
	"manufacturer" text,
	"typical_seats" integer
);
--> statement-breakpoint
CREATE TABLE "reference_airlines" (
	"iata_code" text PRIMARY KEY NOT NULL,
	"icao_code" text,
	"name" text NOT NULL,
	"country" text,
	"logo_url" text,
	"alliance" text
);
--> statement-breakpoint
CREATE TABLE "reference_airports" (
	"iata_code" text PRIMARY KEY NOT NULL,
	"icao_code" text,
	"name" text NOT NULL,
	"city" text NOT NULL,
	"country" text NOT NULL,
	"timezone" text,
	"latitude" real,
	"longitude" real
);
--> statement-breakpoint
CREATE TABLE "contract_attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"contract_id" text NOT NULL,
	"kind" text DEFAULT 'appendix' NOT NULL,
	"name" text NOT NULL,
	"mime_type" text,
	"file_size" integer,
	"storage_key" text,
	"checksum" text,
	"target_kind" "legal_target_kind",
	"target_id" text,
	"target_provider" text,
	"target_source_ref" text,
	"legacy_transaction_offer_id" text,
	"legacy_transaction_order_id" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contract_number_series" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"prefix" text DEFAULT '' NOT NULL,
	"separator" text DEFAULT '' NOT NULL,
	"pad_length" integer DEFAULT 4 NOT NULL,
	"current_sequence" integer DEFAULT 0 NOT NULL,
	"reset_strategy" "contract_number_reset_strategy" DEFAULT 'never' NOT NULL,
	"reset_at" timestamp with time zone,
	"scope" "contract_scope" DEFAULT 'customer' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"external_provider" text,
	"external_config_key" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contract_signatures" (
	"id" text PRIMARY KEY NOT NULL,
	"contract_id" text NOT NULL,
	"signer_name" text NOT NULL,
	"signer_email" text,
	"signer_role" text,
	"person_id" text,
	"target_kind" "legal_target_kind",
	"target_id" text,
	"target_provider" text,
	"target_source_ref" text,
	"legacy_transaction_offer_id" text,
	"legacy_transaction_order_id" text,
	"method" "contract_signature_method" DEFAULT 'manual' NOT NULL,
	"provider" text,
	"external_reference" text,
	"signature_data" text,
	"ip_address" text,
	"user_agent" text,
	"signed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contract_template_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"template_id" text NOT NULL,
	"version" integer NOT NULL,
	"body" text NOT NULL,
	"variable_schema" jsonb,
	"changelog" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contract_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"scope" "contract_scope" NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"description" text,
	"body" text NOT NULL,
	"variable_schema" jsonb,
	"current_version_id" text,
	"channel_id" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contract_templates_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" text PRIMARY KEY NOT NULL,
	"contract_number" text,
	"scope" "contract_scope" NOT NULL,
	"status" "contract_status" DEFAULT 'draft' NOT NULL,
	"stage_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"title" text NOT NULL,
	"template_version_id" text,
	"series_id" text,
	"person_id" text,
	"organization_id" text,
	"supplier_id" text,
	"channel_id" text,
	"booking_id" text,
	"target_kind" "legal_target_kind",
	"target_id" text,
	"target_provider" text,
	"target_source_ref" text,
	"legacy_transaction_offer_id" text,
	"legacy_transaction_order_id" text,
	"issued_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"executed_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"voided_at" timestamp with time zone,
	"language" text DEFAULT 'en' NOT NULL,
	"rendered_body_format" "contract_body_format" DEFAULT 'html' NOT NULL,
	"rendered_body" text,
	"variables" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contracts_contract_number_unique" UNIQUE("contract_number")
);
--> statement-breakpoint
CREATE TABLE "policies" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" "policy_kind" NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"language" text DEFAULT 'en' NOT NULL,
	"current_version_id" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "policies_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "policy_acceptances" (
	"id" text PRIMARY KEY NOT NULL,
	"policy_version_id" text NOT NULL,
	"person_id" text,
	"booking_id" text,
	"target_kind" "legal_target_kind",
	"target_id" text,
	"target_provider" text,
	"target_source_ref" text,
	"legacy_transaction_offer_id" text,
	"legacy_transaction_order_id" text,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_by" text,
	"method" "policy_acceptance_method" DEFAULT 'implicit' NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policy_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"policy_id" text NOT NULL,
	"scope" "policy_assignment_scope" NOT NULL,
	"product_id" text,
	"channel_id" text,
	"supplier_id" text,
	"market_id" text,
	"organization_id" text,
	"valid_from" date,
	"valid_to" date,
	"priority" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policy_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"policy_version_id" text NOT NULL,
	"rule_type" "policy_rule_type" NOT NULL,
	"label" text,
	"days_before_departure" integer,
	"refund_percent" integer,
	"refund_type" "policy_refund_type",
	"flat_amount_cents" integer,
	"currency" text,
	"valid_from" date,
	"valid_to" date,
	"conditions" jsonb,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policy_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"policy_id" text NOT NULL,
	"version" integer NOT NULL,
	"status" "policy_version_status" DEFAULT 'draft' NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"published_at" timestamp with time zone,
	"published_by" text,
	"retired_at" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legal_terms" (
	"id" text PRIMARY KEY NOT NULL,
	"contract_id" text,
	"policy_version_id" text,
	"target_kind" "legal_target_kind",
	"target_id" text,
	"target_provider" text,
	"target_source_ref" text,
	"legacy_transaction_offer_id" text,
	"legacy_transaction_order_id" text,
	"term_type" "legal_term_type" DEFAULT 'terms_and_conditions' NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"language" text,
	"required" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"acceptance_status" "legal_term_acceptance_status" DEFAULT 'pending' NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "storefront_verification_challenges" (
	"id" text PRIMARY KEY NOT NULL,
	"channel" "storefront_verification_channel" NOT NULL,
	"destination" text NOT NULL,
	"purpose" text DEFAULT 'contact_confirmation' NOT NULL,
	"code_hash" text NOT NULL,
	"status" "storefront_verification_status" DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verified_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_component_events" (
	"id" text PRIMARY KEY NOT NULL,
	"envelope_id" text NOT NULL,
	"component_id" text,
	"event_type" "trip_component_event_type" NOT NULL,
	"from_status" "trip_component_status",
	"to_status" "trip_component_status",
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"actor_id" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_components" (
	"id" text PRIMARY KEY NOT NULL,
	"envelope_id" text NOT NULL,
	"sequence" integer DEFAULT 0 NOT NULL,
	"kind" "trip_component_kind" NOT NULL,
	"status" "trip_component_status" DEFAULT 'draft' NOT NULL,
	"title" text,
	"description" text,
	"entity_module" text,
	"entity_id" text,
	"source_kind" text,
	"source_connection_id" text,
	"source_ref" text,
	"booking_draft_id" text,
	"catalog_quote_id" text,
	"booking_id" text,
	"booking_group_id" text,
	"order_id" text,
	"payment_session_id" text,
	"provider_ref" text,
	"supplier_ref" text,
	"component_currency" text,
	"component_subtotal_amount_cents" integer,
	"component_tax_amount_cents" integer,
	"component_total_amount_cents" integer,
	"pricing_snapshot" jsonb,
	"tax_lines" jsonb DEFAULT '[]'::jsonb,
	"cancellation_snapshot" jsonb,
	"hold_token" text,
	"hold_expires_at" timestamp with time zone,
	"price_expires_at" timestamp with time zone,
	"warning_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_envelopes" (
	"id" text PRIMARY KEY NOT NULL,
	"status" "trip_envelope_status" DEFAULT 'draft' NOT NULL,
	"title" text,
	"description" text,
	"traveler_party" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"constraints" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"aggregate_currency" text,
	"aggregate_subtotal_amount_cents" integer,
	"aggregate_tax_amount_cents" integer,
	"aggregate_total_amount_cents" integer,
	"aggregate_pricing_snapshot" jsonb,
	"current_price_expires_at" timestamp with time zone,
	"booking_group_id" text,
	"order_id" text,
	"payment_session_id" text,
	"reserve_idempotency_key" text,
	"reserve_started_at" timestamp with time zone,
	"reserved_at" timestamp with time zone,
	"checkout_idempotency_key" text,
	"checkout_started_at" timestamp with time zone,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_reservation_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"envelope_id" text NOT NULL,
	"snapshot_id" text,
	"status" "trip_reservation_plan_status" DEFAULT 'pending' NOT NULL,
	"idempotency_key" text,
	"refresh_scope" jsonb,
	"component_count" integer DEFAULT 0 NOT NULL,
	"components" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"failures" jsonb DEFAULT '[]'::jsonb,
	"compensations" jsonb DEFAULT '[]'::jsonb,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"submitted_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"envelope_id" text NOT NULL,
	"source_envelope_updated_at" timestamp with time zone NOT NULL,
	"title_snapshot" text,
	"description_snapshot" text,
	"traveler_party_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"constraints_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"currency" text NOT NULL,
	"subtotal_amount_cents" integer DEFAULT 0 NOT NULL,
	"tax_amount_cents" integer DEFAULT 0 NOT NULL,
	"total_amount_cents" integer DEFAULT 0 NOT NULL,
	"component_count" integer DEFAULT 0 NOT NULL,
	"priced_component_count" integer DEFAULT 0 NOT NULL,
	"frozen_envelope" jsonb NOT NULL,
	"frozen_components" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"proposal" jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_tax_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"tax_price_mode" text DEFAULT 'inclusive' NOT NULL,
	"tax_policy_profile_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operator_payment_defaults" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_payment_policy" jsonb,
	"booking_checkout_url_template" text,
	"invoice_pay_url_template" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operator_payment_instructions" (
	"id" text PRIMARY KEY NOT NULL,
	"bank_transfer_beneficiary" text,
	"iban" text,
	"bank" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operator_profile" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"legal_name" text,
	"vat_id" text,
	"registration_number" text,
	"address" text,
	"phone" text,
	"email" text,
	"website" text,
	"license" text,
	"license_authority" text,
	"signatory_name" text,
	"signatory_role" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operator_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"legal_name" text,
	"vat_id" text,
	"registration_number" text,
	"address" text,
	"phone" text,
	"email" text,
	"website" text,
	"iban" text,
	"bank" text,
	"license" text,
	"license_authority" text,
	"signatory_name" text,
	"signatory_role" text,
	"customer_payment_policy" jsonb,
	"tax_price_mode" text DEFAULT 'inclusive' NOT NULL,
	"tax_policy_profile_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_authoring_requests" (
	"idempotency_key" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"operation" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_run_steps" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"step_name" text NOT NULL,
	"sequence" integer NOT NULL,
	"status" "workflow_run_step_status" DEFAULT 'running' NOT NULL,
	"output" jsonb,
	"error" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"duration_ms" integer
);
--> statement-breakpoint
CREATE TABLE "workflow_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"workflow_name" text NOT NULL,
	"trigger" text DEFAULT 'manual' NOT NULL,
	"correlation_id" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "workflow_run_status" DEFAULT 'running' NOT NULL,
	"input" jsonb,
	"result" jsonb,
	"error" jsonb,
	"parent_run_id" text,
	"triggered_by_user_id" text,
	"resume_from_step" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_workflow_runs_completion" CHECK ((
        "workflow_runs"."status" = 'running' AND "workflow_runs"."completed_at" IS NULL
      ) OR (
        "workflow_runs"."status" <> 'running' AND "workflow_runs"."completed_at" IS NOT NULL
      ))
);
--> statement-breakpoint
CREATE TABLE "stay_booking_items" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_item_id" text NOT NULL,
	"property_id" text NOT NULL,
	"room_type_id" text NOT NULL,
	"supplier_room_ref" text,
	"rate_plan_id" text NOT NULL,
	"check_in_date" date NOT NULL,
	"check_out_date" date NOT NULL,
	"night_count" integer DEFAULT 1 NOT NULL,
	"room_count" integer DEFAULT 1 NOT NULL,
	"adults" integer DEFAULT 1 NOT NULL,
	"children" integer DEFAULT 0 NOT NULL,
	"infants" integer DEFAULT 0 NOT NULL,
	"meal_plan_id" text,
	"confirmation_code" text,
	"voucher_code" text,
	"status" "stay_booking_item_status" DEFAULT 'reserved' NOT NULL,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stay_daily_rates" (
	"id" text PRIMARY KEY NOT NULL,
	"stay_booking_item_id" text NOT NULL,
	"date" date NOT NULL,
	"sell_currency" text NOT NULL,
	"sell_amount_cents" integer,
	"cost_currency" text,
	"cost_amount_cents" integer,
	"tax_amount_cents" integer,
	"fee_amount_cents" integer,
	"commission_amount_cents" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meal_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"property_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"includes_breakfast" boolean DEFAULT false NOT NULL,
	"includes_lunch" boolean DEFAULT false NOT NULL,
	"includes_dinner" boolean DEFAULT false NOT NULL,
	"includes_drinks" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_plan_room_types" (
	"id" text PRIMARY KEY NOT NULL,
	"rate_plan_id" text NOT NULL,
	"room_type_id" text NOT NULL,
	"product_id" text,
	"option_id" text,
	"unit_id" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"property_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"meal_plan_id" text,
	"price_catalog_id" text,
	"cancellation_policy_id" text,
	"market_id" text,
	"currency_code" text NOT NULL,
	"charge_frequency" "rate_plan_charge_frequency" DEFAULT 'per_night' NOT NULL,
	"guarantee_mode" "accommodation_guarantee_mode" DEFAULT 'none' NOT NULL,
	"commissionable" boolean DEFAULT true NOT NULL,
	"refundable" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"customer_payment_policy" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "room_type_bed_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"room_type_id" text NOT NULL,
	"bed_type" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "room_types" (
	"id" text PRIMARY KEY NOT NULL,
	"property_id" text NOT NULL,
	"supplier_id" text,
	"code" text,
	"name" text NOT NULL,
	"description" text,
	"inventory_mode" "accommodation_inventory_mode" DEFAULT 'pooled' NOT NULL,
	"room_class" text,
	"max_adults" integer,
	"max_children" integer,
	"max_infants" integer,
	"standard_occupancy" integer,
	"max_occupancy" integer,
	"min_occupancy" integer,
	"bedroom_count" integer,
	"bathroom_count" integer,
	"area_value" integer,
	"area_unit" text,
	"accessibility_notes" text,
	"smoking_allowed" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accommodations_sourced_content" (
	"entity_id" text NOT NULL,
	"locale" text NOT NULL,
	"market" text DEFAULT '*' NOT NULL,
	"payload" jsonb NOT NULL,
	"content_schema_version" text NOT NULL,
	"returned_locale" text NOT NULL,
	"machine_translated" boolean DEFAULT false NOT NULL,
	"source_updated_at" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"fresh_until" timestamp with time zone,
	"etag" text,
	"fetch_status" text DEFAULT 'ok' NOT NULL,
	"fetch_error" text,
	CONSTRAINT "accommodations_sourced_content_entity_id_locale_market_pk" PRIMARY KEY("entity_id","locale","market")
);
--> statement-breakpoint
CREATE TABLE "booking_charter_details" (
	"booking_id" text PRIMARY KEY NOT NULL,
	"booking_mode" charter_booking_mode NOT NULL,
	"source" charter_source DEFAULT 'local' NOT NULL,
	"source_provider" text,
	"source_ref" jsonb,
	"voyage_id" text,
	"suite_id" text,
	"yacht_id" text,
	"voyage_display_name" text,
	"suite_display_name" text,
	"yacht_name" text,
	"charter_area_snapshot" text,
	"guest_count" smallint NOT NULL,
	"quoted_currency" char(3) NOT NULL,
	"quoted_suite_price" numeric(12, 2),
	"quoted_port_fee" numeric(12, 2),
	"quoted_charter_fee" numeric(15, 2),
	"apa_percent" numeric(5, 2),
	"apa_amount" numeric(15, 2),
	"quoted_total" numeric(15, 2) NOT NULL,
	"myba_template_id_snapshot" text,
	"myba_contract_id" text,
	"apa_paid_amount" numeric(15, 2) DEFAULT '0.00',
	"apa_spent_amount" numeric(15, 2) DEFAULT '0.00',
	"apa_refund_amount" numeric(15, 2) DEFAULT '0.00',
	"apa_settled_at" timestamp with time zone,
	"connector_booking_ref" text,
	"connector_status" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "charters_sourced_content" (
	"entity_id" text NOT NULL,
	"locale" text NOT NULL,
	"market" text DEFAULT '*' NOT NULL,
	"payload" jsonb NOT NULL,
	"content_schema_version" text NOT NULL,
	"returned_locale" text NOT NULL,
	"machine_translated" boolean DEFAULT false NOT NULL,
	"source_updated_at" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"fresh_until" timestamp with time zone,
	"etag" text,
	"fetch_status" text DEFAULT 'ok' NOT NULL,
	"fetch_error" text,
	CONSTRAINT "charters_sourced_content_entity_id_locale_market_pk" PRIMARY KEY("entity_id","locale","market")
);
--> statement-breakpoint
CREATE TABLE "charter_products" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"line_supplier_id" text,
	"default_yacht_id" text,
	"description" text,
	"short_description" text,
	"hero_image_url" text,
	"map_image_url" text,
	"regions" jsonb DEFAULT '[]'::jsonb,
	"themes" jsonb DEFAULT '[]'::jsonb,
	"status" charter_status DEFAULT 'draft' NOT NULL,
	"default_booking_modes" jsonb DEFAULT '["per_suite"]'::jsonb,
	"default_myba_template_id" text,
	"default_apa_percent" numeric(5, 2),
	"lowest_price_cached_amount" numeric(12, 2),
	"lowest_price_cached_currency" text,
	"earliest_voyage_cached" date,
	"latest_voyage_cached" date,
	"external_refs" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "charter_voyages" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"yacht_id" text NOT NULL,
	"voyage_code" text NOT NULL,
	"name" text,
	"embark_port_facility_id" text,
	"embark_port_name" text,
	"disembark_port_facility_id" text,
	"disembark_port_name" text,
	"departure_date" date NOT NULL,
	"return_date" date NOT NULL,
	"nights" smallint NOT NULL,
	"booking_modes" jsonb DEFAULT '["per_suite"]'::jsonb NOT NULL,
	"appointment_only" boolean DEFAULT false NOT NULL,
	"whole_yacht_prices_by_currency" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"apa_percent_override" numeric(5, 2),
	"myba_template_id_override" text,
	"charter_area_override" text,
	"sales_status" charter_voyage_sales_status DEFAULT 'open' NOT NULL,
	"availability_note" text,
	"external_refs" jsonb DEFAULT '{}'::jsonb,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "charter_schedule_days" (
	"id" text PRIMARY KEY NOT NULL,
	"voyage_id" text NOT NULL,
	"day_number" smallint NOT NULL,
	"port_facility_id" text,
	"port_name" text,
	"schedule_date" date,
	"arrival_time" time,
	"departure_time" time,
	"is_sea_day" boolean DEFAULT false NOT NULL,
	"description" text,
	"activities" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "charter_suites" (
	"id" text PRIMARY KEY NOT NULL,
	"voyage_id" text NOT NULL,
	"suite_code" text NOT NULL,
	"suite_name" text NOT NULL,
	"suite_category" charter_suite_category,
	"description" text,
	"square_feet" numeric(8, 2),
	"images" jsonb DEFAULT '[]'::jsonb,
	"floorplan_images" jsonb DEFAULT '[]'::jsonb,
	"max_guests" smallint,
	"prices_by_currency" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"port_fees_by_currency" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"availability" charter_suite_availability DEFAULT 'available' NOT NULL,
	"units_available" smallint,
	"appointment_only" boolean DEFAULT false NOT NULL,
	"notes" text,
	"extra" jsonb DEFAULT '{}'::jsonb,
	"external_refs" jsonb DEFAULT '{}'::jsonb,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "charter_yachts" (
	"id" text PRIMARY KEY NOT NULL,
	"line_supplier_id" text,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"yacht_class" charter_yacht_class NOT NULL,
	"capacity_guests" integer,
	"capacity_crew" integer,
	"length_meters" numeric(8, 2),
	"year_built" integer,
	"year_refurbished" integer,
	"imo" text,
	"description" text,
	"gallery" jsonb DEFAULT '[]'::jsonb,
	"amenities" jsonb DEFAULT '{}'::jsonb,
	"crew_bios" jsonb DEFAULT '[]'::jsonb,
	"default_charter_areas" jsonb DEFAULT '[]'::jsonb,
	"external_refs" jsonb DEFAULT '{}'::jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_cruise_details" (
	"booking_id" text PRIMARY KEY NOT NULL,
	"source" "cruise_source" DEFAULT 'local' NOT NULL,
	"source_provider" text,
	"source_ref" jsonb,
	"sailing_id" text,
	"cabin_category_id" text,
	"cabin_id" text,
	"sailing_display_name" text,
	"cabin_display_name" text,
	"occupancy" smallint NOT NULL,
	"fare_code" text,
	"fare_variant" "cruise_price_fare_variant" DEFAULT 'cruise_only' NOT NULL,
	"mode" "cruise_booking_mode" DEFAULT 'inquiry' NOT NULL,
	"quoted_price_per_person" numeric(12, 2) NOT NULL,
	"quoted_total_for_cabin" numeric(12, 2) NOT NULL,
	"quoted_currency" char(3) NOT NULL,
	"quoted_components_json" jsonb DEFAULT '[]'::jsonb,
	"booking_terms_snapshot_json" jsonb,
	"passenger_composition_snapshot_json" jsonb,
	"connector_booking_ref" text,
	"connector_status" text,
	"air_arrangement" "cruise_air_arrangement",
	"linked_flight_booking_id" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_group_cruise_details" (
	"booking_group_id" text PRIMARY KEY NOT NULL,
	"source" "cruise_source" DEFAULT 'local' NOT NULL,
	"source_provider" text,
	"source_ref" jsonb,
	"sailing_id" text,
	"sailing_display_name" text,
	"cabin_count" smallint NOT NULL,
	"total_quoted_amount" numeric(12, 2) NOT NULL,
	"quoted_currency" char(3) NOT NULL,
	"connector_booking_ref" text,
	"booking_terms_snapshot_json" jsonb,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cruises_sourced_content" (
	"entity_id" text NOT NULL,
	"locale" text NOT NULL,
	"market" text DEFAULT '*' NOT NULL,
	"payload" jsonb NOT NULL,
	"content_schema_version" text NOT NULL,
	"returned_locale" text NOT NULL,
	"machine_translated" boolean DEFAULT false NOT NULL,
	"source_updated_at" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"fresh_until" timestamp with time zone,
	"etag" text,
	"fetch_status" text DEFAULT 'ok' NOT NULL,
	"fetch_error" text,
	CONSTRAINT "cruises_sourced_content_entity_id_locale_market_pk" PRIMARY KEY("entity_id","locale","market")
);
--> statement-breakpoint
CREATE TABLE "cruise_cabin_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"ship_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"room_type" "cruise_cabin_room_type" NOT NULL,
	"description" text,
	"min_occupancy" smallint DEFAULT 1 NOT NULL,
	"max_occupancy" smallint NOT NULL,
	"square_feet" numeric(8, 2),
	"wheelchair_accessible" boolean DEFAULT false NOT NULL,
	"amenities" jsonb DEFAULT '[]'::jsonb,
	"feature_codes" jsonb DEFAULT '[]'::jsonb,
	"bed_configurations" jsonb DEFAULT '[]'::jsonb,
	"accessibility_features" jsonb DEFAULT '[]'::jsonb,
	"view_type" text,
	"images" jsonb DEFAULT '[]'::jsonb,
	"floorplan_images" jsonb DEFAULT '[]'::jsonb,
	"grade_codes" jsonb DEFAULT '[]'::jsonb,
	"external_refs" jsonb DEFAULT '{}'::jsonb,
	"customer_payment_policy" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cruise_cabins" (
	"id" text PRIMARY KEY NOT NULL,
	"category_id" text NOT NULL,
	"cabin_number" text NOT NULL,
	"deck_id" text,
	"position" text,
	"connects_to" text,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cruise_decks" (
	"id" text PRIMARY KEY NOT NULL,
	"ship_id" text NOT NULL,
	"name" text NOT NULL,
	"level" smallint,
	"plan_image_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cruise_ships" (
	"id" text PRIMARY KEY NOT NULL,
	"line_supplier_id" text,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"ship_type" "cruise_ship_type" NOT NULL,
	"capacity_guests" integer,
	"capacity_crew" integer,
	"cabin_count" integer,
	"deck_count" integer,
	"length_meters" numeric(8, 2),
	"cruising_speed_knots" numeric(5, 2),
	"year_built" integer,
	"year_refurbished" integer,
	"imo" text,
	"description" text,
	"deck_plan_url" text,
	"gallery" jsonb DEFAULT '[]'::jsonb,
	"amenities" jsonb DEFAULT '{}'::jsonb,
	"external_refs" jsonb DEFAULT '{}'::jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cruise_enrichment_programs" (
	"id" text PRIMARY KEY NOT NULL,
	"cruise_id" text NOT NULL,
	"kind" "cruise_enrichment_program_kind" NOT NULL,
	"name" text NOT NULL,
	"title" text,
	"description" text,
	"bio_image_url" text,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cruise_inclusions" (
	"id" text PRIMARY KEY NOT NULL,
	"cruise_id" text NOT NULL,
	"kind" "cruise_inclusion_kind" NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cruise_media" (
	"id" text PRIMARY KEY NOT NULL,
	"cruise_id" text NOT NULL,
	"sailing_id" text,
	"media_type" "cruise_media_type" NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"storage_key" text,
	"mime_type" text,
	"file_size" integer,
	"alt_text" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_cover" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cruise_sailings" (
	"id" text PRIMARY KEY NOT NULL,
	"cruise_id" text NOT NULL,
	"ship_id" text NOT NULL,
	"departure_date" date NOT NULL,
	"return_date" date NOT NULL,
	"embark_port_facility_id" text,
	"embark_port_canonical_place_id" text,
	"disembark_port_facility_id" text,
	"disembark_port_canonical_place_id" text,
	"direction" "cruise_sailing_direction",
	"availability_note" text,
	"is_charter" boolean DEFAULT false NOT NULL,
	"sales_status" "cruise_sailing_sales_status" DEFAULT 'open' NOT NULL,
	"external_refs" jsonb DEFAULT '{}'::jsonb,
	"customer_payment_policy" jsonb,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cruise_voyage_group_segments" (
	"id" text PRIMARY KEY NOT NULL,
	"voyage_group_id" text NOT NULL,
	"sort_order" integer NOT NULL,
	"segment_kind" "cruise_voyage_segment_kind" NOT NULL,
	"segment_role" "cruise_voyage_segment_role" DEFAULT 'core' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"cruise_id" text,
	"sailing_id" text,
	"start_day" integer,
	"end_day" integer,
	"start_date" date,
	"end_date" date,
	"embark_port_facility_id" text,
	"embark_port_canonical_place_id" text,
	"disembark_port_facility_id" text,
	"disembark_port_canonical_place_id" text,
	"nights" integer,
	"external_refs" jsonb DEFAULT '{}'::jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cruise_voyage_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"group_kind" "cruise_voyage_group_kind" NOT NULL,
	"line_supplier_id" text,
	"nights" integer NOT NULL,
	"embark_port_facility_id" text,
	"embark_port_canonical_place_id" text,
	"disembark_port_facility_id" text,
	"disembark_port_canonical_place_id" text,
	"description" text,
	"short_description" text,
	"highlights" jsonb DEFAULT '[]'::jsonb,
	"regions" jsonb DEFAULT '[]'::jsonb,
	"themes" jsonb DEFAULT '[]'::jsonb,
	"hero_image_url" text,
	"map_image_url" text,
	"status" "cruise_status" DEFAULT 'draft' NOT NULL,
	"lowest_price_cached" numeric(12, 2),
	"lowest_price_currency_cached" text,
	"earliest_departure_cached" date,
	"latest_departure_cached" date,
	"external_refs" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cruises" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"cruise_type" "cruise_type" NOT NULL,
	"line_supplier_id" text,
	"default_ship_id" text,
	"nights" integer NOT NULL,
	"embark_port_facility_id" text,
	"embark_port_canonical_place_id" text,
	"disembark_port_facility_id" text,
	"disembark_port_canonical_place_id" text,
	"description" text,
	"short_description" text,
	"highlights" jsonb DEFAULT '[]'::jsonb,
	"inclusions_html" text,
	"exclusions_html" text,
	"region_ids" jsonb DEFAULT '[]'::jsonb,
	"waterway_ids" jsonb DEFAULT '[]'::jsonb,
	"port_ids" jsonb DEFAULT '[]'::jsonb,
	"country_iso" jsonb DEFAULT '[]'::jsonb,
	"regions" jsonb DEFAULT '[]'::jsonb,
	"waterways" jsonb DEFAULT '[]'::jsonb,
	"ports" jsonb DEFAULT '[]'::jsonb,
	"countries" jsonb DEFAULT '[]'::jsonb,
	"themes" jsonb DEFAULT '[]'::jsonb,
	"hero_image_url" text,
	"map_image_url" text,
	"status" "cruise_status" DEFAULT 'draft' NOT NULL,
	"lowest_price_cached" numeric(12, 2),
	"lowest_price_currency_cached" text,
	"earliest_departure_cached" date,
	"latest_departure_cached" date,
	"external_refs" jsonb DEFAULT '{}'::jsonb,
	"customer_payment_policy" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cruise_days" (
	"id" text PRIMARY KEY NOT NULL,
	"cruise_id" text NOT NULL,
	"day_number" smallint NOT NULL,
	"title" text,
	"description" text,
	"port_facility_id" text,
	"port_canonical_place_id" text,
	"arrival_time" time,
	"departure_time" time,
	"is_overnight" boolean DEFAULT false NOT NULL,
	"is_sea_day" boolean DEFAULT false NOT NULL,
	"is_expedition_landing" boolean DEFAULT false NOT NULL,
	"meals" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cruise_sailing_days" (
	"id" text PRIMARY KEY NOT NULL,
	"sailing_id" text NOT NULL,
	"day_number" smallint NOT NULL,
	"title" text,
	"description" text,
	"port_facility_id" text,
	"port_canonical_place_id" text,
	"arrival_time" time,
	"departure_time" time,
	"is_overnight" boolean,
	"is_sea_day" boolean,
	"is_expedition_landing" boolean,
	"is_skipped" boolean DEFAULT false NOT NULL,
	"meals" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cruise_price_components" (
	"id" text PRIMARY KEY NOT NULL,
	"price_id" text NOT NULL,
	"kind" "cruise_price_component_kind" NOT NULL,
	"label" text,
	"amount" numeric(12, 2) NOT NULL,
	"currency" text NOT NULL,
	"direction" "cruise_price_component_direction" NOT NULL,
	"per_person" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cruise_prices" (
	"id" text PRIMARY KEY NOT NULL,
	"sailing_id" text NOT NULL,
	"cabin_category_id" text NOT NULL,
	"occupancy" smallint NOT NULL,
	"fare_code" text,
	"fare_code_name" text,
	"fare_variant" "cruise_price_fare_variant" DEFAULT 'cruise_only' NOT NULL,
	"currency" text NOT NULL,
	"price_per_person" numeric(12, 2) NOT NULL,
	"original_price_per_person" numeric(12, 2),
	"second_guest_price_per_person" numeric(12, 2),
	"single_price_per_person" numeric(12, 2),
	"single_supplement_percent" numeric(5, 2),
	"availability" "cruise_price_availability" DEFAULT 'available' NOT NULL,
	"availability_count" integer,
	"price_catalog_id" text,
	"price_schedule_id" text,
	"booking_deadline" date,
	"early_booking_deadline" date,
	"early_booking_bonus_description" text,
	"requires_request" boolean DEFAULT false NOT NULL,
	"notes" text,
	"external_refs" jsonb DEFAULT '{}'::jsonb,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cruise_search_index" (
	"id" text PRIMARY KEY NOT NULL,
	"source" "cruise_source" NOT NULL,
	"source_provider" text,
	"source_ref" jsonb,
	"local_cruise_id" text,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"cruise_type" "cruise_type" NOT NULL,
	"line_name" text NOT NULL,
	"ship_name" text NOT NULL,
	"nights" integer NOT NULL,
	"embark_port_name" text,
	"embark_port_canonical_place_id" text,
	"disembark_port_name" text,
	"disembark_port_canonical_place_id" text,
	"region_ids" jsonb DEFAULT '[]'::jsonb,
	"waterway_ids" jsonb DEFAULT '[]'::jsonb,
	"port_ids" jsonb DEFAULT '[]'::jsonb,
	"country_iso" jsonb DEFAULT '[]'::jsonb,
	"regions" jsonb DEFAULT '[]'::jsonb,
	"waterways" jsonb DEFAULT '[]'::jsonb,
	"ports" jsonb DEFAULT '[]'::jsonb,
	"countries" jsonb DEFAULT '[]'::jsonb,
	"themes" jsonb DEFAULT '[]'::jsonb,
	"earliest_departure" date,
	"latest_departure" date,
	"departure_count" integer,
	"lowest_price_cents" integer,
	"lowest_price_currency" char(3),
	"sales_status" text,
	"hero_image_url" text,
	"refreshed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_auth_session_links" ADD CONSTRAINT "cloud_auth_session_links_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_auth_session_links" ADD CONSTRAINT "cloud_auth_session_links_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_auth_user_links" ADD CONSTRAINT "cloud_auth_user_links_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_id_user_id_fk" FOREIGN KEY ("id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_approvals" ADD CONSTRAINT "action_approvals_requested_action_id_action_ledger_entries_id_fk" FOREIGN KEY ("requested_action_id") REFERENCES "public"."action_ledger_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_ledger_payloads" ADD CONSTRAINT "action_ledger_payloads_action_id_action_ledger_entries_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."action_ledger_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_ledger_outbox" ADD CONSTRAINT "action_ledger_outbox_action_id_action_ledger_entries_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."action_ledger_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_mutation_details" ADD CONSTRAINT "action_mutation_details_action_id_action_ledger_entries_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."action_ledger_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_sensitive_read_details" ADD CONSTRAINT "action_sensitive_read_details_action_id_action_ledger_entries_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."action_ledger_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_log" ADD CONSTRAINT "communication_log_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_log" ADD CONSTRAINT "communication_log_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_notes" ADD CONSTRAINT "organization_notes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_documents" ADD CONSTRAINT "person_documents_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_notes" ADD CONSTRAINT "person_notes_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_payment_methods" ADD CONSTRAINT "person_payment_methods_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_relationships" ADD CONSTRAINT "person_relationships_from_person_id_people_id_fk" FOREIGN KEY ("from_person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_relationships" ADD CONSTRAINT "person_relationships_to_person_id_people_id_fk" FOREIGN KEY ("to_person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "segment_members" ADD CONSTRAINT "segment_members_segment_id_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."segments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "segment_members" ADD CONSTRAINT "segment_members_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_links" ADD CONSTRAINT "activity_links_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_participants" ADD CONSTRAINT "activity_participants_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_participants" ADD CONSTRAINT "activity_participants_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field_values" ADD CONSTRAINT "custom_field_values_definition_id_custom_field_definitions_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."custom_field_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_signals" ADD CONSTRAINT "customer_signals_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_delivery_requests" ADD CONSTRAINT "proposal_delivery_requests_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_delivery_requests" ADD CONSTRAINT "proposal_delivery_requests_proposal_version_id_proposal_versions_id_fk" FOREIGN KEY ("proposal_version_id") REFERENCES "public"."proposal_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_participants" ADD CONSTRAINT "proposal_participants_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_products" ADD CONSTRAINT "proposal_products_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_version_lines" ADD CONSTRAINT "proposal_version_lines_proposal_version_id_proposal_versions_id_fk" FOREIGN KEY ("proposal_version_id") REFERENCES "public"."proposal_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_versions" ADD CONSTRAINT "proposal_versions_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_versions" ADD CONSTRAINT "proposal_versions_supersedes_id_proposal_versions_id_fk" FOREIGN KEY ("supersedes_id") REFERENCES "public"."proposal_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_pipeline_id_pipelines_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipelines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_stage_id_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."stages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stages" ADD CONSTRAINT "stages_pipeline_id_pipelines_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipelines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_reconciliation_policies" ADD CONSTRAINT "channel_reconciliation_policies_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_reconciliation_policies" ADD CONSTRAINT "channel_reconciliation_policies_contract_id_channel_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."channel_contracts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_release_schedules" ADD CONSTRAINT "channel_release_schedules_release_rule_id_channel_inventory_release_rules_id_fk" FOREIGN KEY ("release_rule_id") REFERENCES "public"."channel_inventory_release_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_settlement_policies" ADD CONSTRAINT "channel_settlement_policies_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_settlement_policies" ADD CONSTRAINT "channel_settlement_policies_contract_id_channel_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."channel_contracts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_booking_links" ADD CONSTRAINT "channel_booking_links_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_commission_rules" ADD CONSTRAINT "channel_commission_rules_contract_id_channel_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."channel_contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_contact_projections" ADD CONSTRAINT "channel_contact_projections_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_contracts" ADD CONSTRAINT "channel_contracts_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_contracts" ADD CONSTRAINT "channel_contracts_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_product_mappings" ADD CONSTRAINT "channel_product_mappings_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_webhook_events" ADD CONSTRAINT "channel_webhook_events_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_reconciliation_items" ADD CONSTRAINT "channel_reconciliation_items_reconciliation_run_id_channel_reconciliation_runs_id_fk" FOREIGN KEY ("reconciliation_run_id") REFERENCES "public"."channel_reconciliation_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_reconciliation_items" ADD CONSTRAINT "channel_reconciliation_items_booking_link_id_channel_booking_links_id_fk" FOREIGN KEY ("booking_link_id") REFERENCES "public"."channel_booking_links"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_reconciliation_runs" ADD CONSTRAINT "channel_reconciliation_runs_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_reconciliation_runs" ADD CONSTRAINT "channel_reconciliation_runs_contract_id_channel_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."channel_contracts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_remittance_exceptions" ADD CONSTRAINT "channel_remittance_exceptions_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_remittance_exceptions" ADD CONSTRAINT "channel_remittance_exceptions_settlement_item_id_channel_settlement_items_id_fk" FOREIGN KEY ("settlement_item_id") REFERENCES "public"."channel_settlement_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_remittance_exceptions" ADD CONSTRAINT "channel_remittance_exceptions_reconciliation_item_id_channel_reconciliation_items_id_fk" FOREIGN KEY ("reconciliation_item_id") REFERENCES "public"."channel_reconciliation_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_settlement_approvals" ADD CONSTRAINT "channel_settlement_approvals_settlement_run_id_channel_settlement_runs_id_fk" FOREIGN KEY ("settlement_run_id") REFERENCES "public"."channel_settlement_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_settlement_items" ADD CONSTRAINT "channel_settlement_items_settlement_run_id_channel_settlement_runs_id_fk" FOREIGN KEY ("settlement_run_id") REFERENCES "public"."channel_settlement_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_settlement_items" ADD CONSTRAINT "channel_settlement_items_booking_link_id_channel_booking_links_id_fk" FOREIGN KEY ("booking_link_id") REFERENCES "public"."channel_booking_links"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_settlement_items" ADD CONSTRAINT "channel_settlement_items_commission_rule_id_channel_commission_rules_id_fk" FOREIGN KEY ("commission_rule_id") REFERENCES "public"."channel_commission_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_settlement_runs" ADD CONSTRAINT "channel_settlement_runs_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_settlement_runs" ADD CONSTRAINT "channel_settlement_runs_contract_id_channel_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."channel_contracts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_inventory_allotment_targets" ADD CONSTRAINT "channel_inventory_allotment_targets_allotment_id_channel_inventory_allotments_id_fk" FOREIGN KEY ("allotment_id") REFERENCES "public"."channel_inventory_allotments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_inventory_allotments" ADD CONSTRAINT "channel_inventory_allotments_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_inventory_allotments" ADD CONSTRAINT "channel_inventory_allotments_contract_id_channel_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."channel_contracts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_inventory_release_executions" ADD CONSTRAINT "channel_inventory_release_executions_allotment_id_channel_inventory_allotments_id_fk" FOREIGN KEY ("allotment_id") REFERENCES "public"."channel_inventory_allotments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_inventory_release_executions" ADD CONSTRAINT "channel_inventory_release_executions_release_rule_id_channel_inventory_release_rules_id_fk" FOREIGN KEY ("release_rule_id") REFERENCES "public"."channel_inventory_release_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_inventory_release_executions" ADD CONSTRAINT "channel_inventory_release_executions_target_id_channel_inventory_allotment_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."channel_inventory_allotment_targets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_inventory_release_rules" ADD CONSTRAINT "channel_inventory_release_rules_allotment_id_channel_inventory_allotments_id_fk" FOREIGN KEY ("allotment_id") REFERENCES "public"."channel_inventory_allotments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_availability_push_intents" ADD CONSTRAINT "channel_availability_push_intents_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_content_push_intents" ADD CONSTRAINT "channel_content_push_intents_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_availability" ADD CONSTRAINT "supplier_availability_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_contracts" ADD CONSTRAINT "supplier_contracts_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_directory_projections" ADD CONSTRAINT "supplier_directory_projections_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_notes" ADD CONSTRAINT "supplier_notes_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_rates" ADD CONSTRAINT "supplier_rates_service_id_supplier_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."supplier_services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_services" ADD CONSTRAINT "supplier_services_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "option_extra_configs" ADD CONSTRAINT "option_extra_configs_product_extra_id_product_extras_id_fk" FOREIGN KEY ("product_extra_id") REFERENCES "public"."product_extras"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "option_units" ADD CONSTRAINT "option_units_option_id_product_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."product_options"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_options" ADD CONSTRAINT "product_options_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_pax_pricing_tiers" ADD CONSTRAINT "product_pax_pricing_tiers_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_pax_pricing_tiers" ADD CONSTRAINT "product_pax_pricing_tiers_option_unit_id_option_units_id_fk" FOREIGN KEY ("option_unit_id") REFERENCES "public"."option_units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_day_services" ADD CONSTRAINT "product_day_services_day_id_product_days_id_fk" FOREIGN KEY ("day_id") REFERENCES "public"."product_days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_day_translations" ADD CONSTRAINT "product_day_translations_day_id_product_days_id_fk" FOREIGN KEY ("day_id") REFERENCES "public"."product_days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_days" ADD CONSTRAINT "product_days_itinerary_id_product_itineraries_id_fk" FOREIGN KEY ("itinerary_id") REFERENCES "public"."product_itineraries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_itineraries" ADD CONSTRAINT "product_itineraries_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_day_id_product_days_id_fk" FOREIGN KEY ("day_id") REFERENCES "public"."product_days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_notes" ADD CONSTRAINT "product_notes_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_versions" ADD CONSTRAINT "product_versions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "option_unit_translations" ADD CONSTRAINT "option_unit_translations_unit_id_option_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."option_units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_activation_settings" ADD CONSTRAINT "product_activation_settings_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_capabilities" ADD CONSTRAINT "product_capabilities_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_delivery_formats" ADD CONSTRAINT "product_delivery_formats_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_faqs" ADD CONSTRAINT "product_faqs_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_features" ADD CONSTRAINT "product_features_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_locations" ADD CONSTRAINT "product_locations_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_option_translations" ADD CONSTRAINT "product_option_translations_option_id_product_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."product_options"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_ticket_settings" ADD CONSTRAINT "product_ticket_settings_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_translations" ADD CONSTRAINT "product_translations_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_visibility_settings" ADD CONSTRAINT "product_visibility_settings_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "destination_translations" ADD CONSTRAINT "destination_translations_destination_id_destinations_id_fk" FOREIGN KEY ("destination_id") REFERENCES "public"."destinations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_category_products" ADD CONSTRAINT "product_category_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_category_products" ADD CONSTRAINT "product_category_products_category_id_product_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."product_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_category_translations" ADD CONSTRAINT "product_category_translations_category_id_product_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."product_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_destinations" ADD CONSTRAINT "product_destinations_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_destinations" ADD CONSTRAINT "product_destinations_destination_id_destinations_id_fk" FOREIGN KEY ("destination_id") REFERENCES "public"."destinations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_tag_products" ADD CONSTRAINT "product_tag_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_tag_products" ADD CONSTRAINT "product_tag_products_tag_id_product_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."product_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_tag_translations" ADD CONSTRAINT "product_tag_translations_tag_id_product_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."product_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_fx_rate_set_id_fx_rate_sets_id_fk" FOREIGN KEY ("fx_rate_set_id") REFERENCES "public"."fx_rate_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_channel_rules" ADD CONSTRAINT "market_channel_rules_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_channel_rules" ADD CONSTRAINT "market_channel_rules_price_catalog_id_market_price_catalogs_id_fk" FOREIGN KEY ("price_catalog_id") REFERENCES "public"."market_price_catalogs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_currencies" ADD CONSTRAINT "market_currencies_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_locales" ADD CONSTRAINT "market_locales_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_price_catalogs" ADD CONSTRAINT "market_price_catalogs_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_product_rules" ADD CONSTRAINT "market_product_rules_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_product_rules" ADD CONSTRAINT "market_product_rules_price_catalog_id_market_price_catalogs_id_fk" FOREIGN KEY ("price_catalog_id") REFERENCES "public"."market_price_catalogs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_schedules" ADD CONSTRAINT "price_schedules_price_catalog_id_price_catalogs_id_fk" FOREIGN KEY ("price_catalog_id") REFERENCES "public"."price_catalogs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_category_dependencies" ADD CONSTRAINT "pricing_category_dependencies_pricing_category_id_pricing_categories_id_fk" FOREIGN KEY ("pricing_category_id") REFERENCES "public"."pricing_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_category_dependencies" ADD CONSTRAINT "pricing_category_dependencies_master_pricing_category_id_pricing_categories_id_fk" FOREIGN KEY ("master_pricing_category_id") REFERENCES "public"."pricing_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departure_price_overrides" ADD CONSTRAINT "departure_price_overrides_price_catalog_id_price_catalogs_id_fk" FOREIGN KEY ("price_catalog_id") REFERENCES "public"."price_catalogs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dropoff_price_rules" ADD CONSTRAINT "dropoff_price_rules_option_price_rule_id_option_price_rules_id_fk" FOREIGN KEY ("option_price_rule_id") REFERENCES "public"."option_price_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extra_price_rules" ADD CONSTRAINT "extra_price_rules_option_price_rule_id_option_price_rules_id_fk" FOREIGN KEY ("option_price_rule_id") REFERENCES "public"."option_price_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "option_price_rules" ADD CONSTRAINT "option_price_rules_price_catalog_id_price_catalogs_id_fk" FOREIGN KEY ("price_catalog_id") REFERENCES "public"."price_catalogs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "option_price_rules" ADD CONSTRAINT "option_price_rules_price_schedule_id_price_schedules_id_fk" FOREIGN KEY ("price_schedule_id") REFERENCES "public"."price_schedules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "option_price_rules" ADD CONSTRAINT "option_price_rules_cancellation_policy_id_cancellation_policies_id_fk" FOREIGN KEY ("cancellation_policy_id") REFERENCES "public"."cancellation_policies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "option_start_time_rules" ADD CONSTRAINT "option_start_time_rules_option_price_rule_id_option_price_rules_id_fk" FOREIGN KEY ("option_price_rule_id") REFERENCES "public"."option_price_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "option_unit_price_rules" ADD CONSTRAINT "option_unit_price_rules_option_price_rule_id_option_price_rules_id_fk" FOREIGN KEY ("option_price_rule_id") REFERENCES "public"."option_price_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "option_unit_price_rules" ADD CONSTRAINT "option_unit_price_rules_pricing_category_id_pricing_categories_id_fk" FOREIGN KEY ("pricing_category_id") REFERENCES "public"."pricing_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "option_unit_tiers" ADD CONSTRAINT "option_unit_tiers_option_unit_price_rule_id_option_unit_price_rules_id_fk" FOREIGN KEY ("option_unit_price_rule_id") REFERENCES "public"."option_unit_price_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_price_rules" ADD CONSTRAINT "pickup_price_rules_option_price_rule_id_option_price_rules_id_fk" FOREIGN KEY ("option_price_rule_id") REFERENCES "public"."option_price_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cancellation_policy_rules" ADD CONSTRAINT "cancellation_policy_rules_cancellation_policy_id_cancellation_policies_id_fk" FOREIGN KEY ("cancellation_policy_id") REFERENCES "public"."cancellation_policies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotional_offer_products" ADD CONSTRAINT "promotional_offer_products_offer_id_promotional_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."promotional_offers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotional_offer_redemptions" ADD CONSTRAINT "promotional_offer_redemptions_offer_id_promotional_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."promotional_offers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_expiration_events" ADD CONSTRAINT "offer_expiration_events_snapshot_id_sellability_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."sellability_snapshots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_refresh_runs" ADD CONSTRAINT "offer_refresh_runs_snapshot_id_sellability_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."sellability_snapshots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sellability_explanations" ADD CONSTRAINT "sellability_explanations_snapshot_id_sellability_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."sellability_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sellability_explanations" ADD CONSTRAINT "sellability_explanations_snapshot_item_id_sellability_snapshot_items_id_fk" FOREIGN KEY ("snapshot_item_id") REFERENCES "public"."sellability_snapshot_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sellability_policy_results" ADD CONSTRAINT "sellability_policy_results_snapshot_id_sellability_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."sellability_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sellability_policy_results" ADD CONSTRAINT "sellability_policy_results_snapshot_item_id_sellability_snapshot_items_id_fk" FOREIGN KEY ("snapshot_item_id") REFERENCES "public"."sellability_snapshot_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sellability_policy_results" ADD CONSTRAINT "sellability_policy_results_policy_id_sellability_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."sellability_policies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sellability_snapshot_items" ADD CONSTRAINT "sellability_snapshot_items_snapshot_id_sellability_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."sellability_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_answers" ADD CONSTRAINT "booking_answers_product_booking_question_id_product_booking_questions_id_fk" FOREIGN KEY ("product_booking_question_id") REFERENCES "public"."product_booking_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_question_extra_triggers" ADD CONSTRAINT "booking_question_extra_triggers_product_booking_question_id_product_booking_questions_id_fk" FOREIGN KEY ("product_booking_question_id") REFERENCES "public"."product_booking_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_question_option_triggers" ADD CONSTRAINT "booking_question_option_triggers_product_booking_question_id_product_booking_questions_id_fk" FOREIGN KEY ("product_booking_question_id") REFERENCES "public"."product_booking_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_question_options" ADD CONSTRAINT "booking_question_options_product_booking_question_id_product_booking_questions_id_fk" FOREIGN KEY ("product_booking_question_id") REFERENCES "public"."product_booking_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_question_unit_triggers" ADD CONSTRAINT "booking_question_unit_triggers_product_booking_question_id_product_booking_questions_id_fk" FOREIGN KEY ("product_booking_question_id") REFERENCES "public"."product_booking_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "option_booking_questions" ADD CONSTRAINT "option_booking_questions_product_booking_question_id_product_booking_questions_id_fk" FOREIGN KEY ("product_booking_question_id") REFERENCES "public"."product_booking_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_traveler_travel_details" ADD CONSTRAINT "booking_traveler_travel_details_traveler_id_booking_travelers_id_fk" FOREIGN KEY ("traveler_id") REFERENCES "public"."booking_travelers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_travelers" ADD CONSTRAINT "booking_travelers_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_group_members" ADD CONSTRAINT "booking_group_members_group_id_booking_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."booking_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_group_members" ADD CONSTRAINT "booking_group_members_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_allocations" ADD CONSTRAINT "booking_allocations_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_allocations" ADD CONSTRAINT "booking_allocations_booking_item_id_booking_items_id_fk" FOREIGN KEY ("booking_item_id") REFERENCES "public"."booking_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_allocations" ADD CONSTRAINT "booking_allocations_availability_slot_id_availability_slots_id_fk" FOREIGN KEY ("availability_slot_id") REFERENCES "public"."availability_slots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_fulfillments" ADD CONSTRAINT "booking_fulfillments_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_fulfillments" ADD CONSTRAINT "booking_fulfillments_booking_item_id_booking_items_id_fk" FOREIGN KEY ("booking_item_id") REFERENCES "public"."booking_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_fulfillments" ADD CONSTRAINT "booking_fulfillments_traveler_id_booking_travelers_id_fk" FOREIGN KEY ("traveler_id") REFERENCES "public"."booking_travelers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_item_travelers" ADD CONSTRAINT "booking_item_travelers_booking_item_id_booking_items_id_fk" FOREIGN KEY ("booking_item_id") REFERENCES "public"."booking_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_item_travelers" ADD CONSTRAINT "booking_item_travelers_traveler_id_booking_travelers_id_fk" FOREIGN KEY ("traveler_id") REFERENCES "public"."booking_travelers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_items" ADD CONSTRAINT "booking_items_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_redemption_events" ADD CONSTRAINT "booking_redemption_events_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_redemption_events" ADD CONSTRAINT "booking_redemption_events_booking_item_id_booking_items_id_fk" FOREIGN KEY ("booking_item_id") REFERENCES "public"."booking_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_redemption_events" ADD CONSTRAINT "booking_redemption_events_traveler_id_booking_travelers_id_fk" FOREIGN KEY ("traveler_id") REFERENCES "public"."booking_travelers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_activity_log" ADD CONSTRAINT "booking_activity_log_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_documents" ADD CONSTRAINT "booking_documents_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_documents" ADD CONSTRAINT "booking_documents_traveler_id_booking_travelers_id_fk" FOREIGN KEY ("traveler_id") REFERENCES "public"."booking_travelers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_notes" ADD CONSTRAINT "booking_notes_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_session_states" ADD CONSTRAINT "booking_session_states_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_supplier_statuses" ADD CONSTRAINT "booking_supplier_statuses_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_origins" ADD CONSTRAINT "booking_origins_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_staff_assignments" ADD CONSTRAINT "booking_staff_assignments_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_staff_assignments" ADD CONSTRAINT "booking_staff_assignments_booking_item_id_booking_items_id_fk" FOREIGN KEY ("booking_item_id") REFERENCES "public"."booking_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_guarantees" ADD CONSTRAINT "booking_guarantees_booking_payment_schedule_id_booking_payment_schedules_id_fk" FOREIGN KEY ("booking_payment_schedule_id") REFERENCES "public"."booking_payment_schedules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_guarantees" ADD CONSTRAINT "booking_guarantees_payment_instrument_id_payment_instruments_id_fk" FOREIGN KEY ("payment_instrument_id") REFERENCES "public"."payment_instruments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_guarantees" ADD CONSTRAINT "booking_guarantees_payment_authorization_id_payment_authorizations_id_fk" FOREIGN KEY ("payment_authorization_id") REFERENCES "public"."payment_authorizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_notes" ADD CONSTRAINT "finance_notes_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_attachments" ADD CONSTRAINT "invoice_attachments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_external_refs" ADD CONSTRAINT "invoice_external_refs_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_renditions" ADD CONSTRAINT "invoice_renditions_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_renditions" ADD CONSTRAINT "invoice_renditions_template_id_invoice_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."invoice_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_authorizations" ADD CONSTRAINT "payment_authorizations_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_authorizations" ADD CONSTRAINT "payment_authorizations_payment_instrument_id_payment_instruments_id_fk" FOREIGN KEY ("payment_instrument_id") REFERENCES "public"."payment_instruments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_captures" ADD CONSTRAINT "payment_captures_payment_authorization_id_payment_authorizations_id_fk" FOREIGN KEY ("payment_authorization_id") REFERENCES "public"."payment_authorizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_captures" ADD CONSTRAINT "payment_captures_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_sessions" ADD CONSTRAINT "payment_sessions_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_sessions" ADD CONSTRAINT "payment_sessions_booking_payment_schedule_id_booking_payment_schedules_id_fk" FOREIGN KEY ("booking_payment_schedule_id") REFERENCES "public"."booking_payment_schedules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_sessions" ADD CONSTRAINT "payment_sessions_booking_guarantee_id_booking_guarantees_id_fk" FOREIGN KEY ("booking_guarantee_id") REFERENCES "public"."booking_guarantees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_sessions" ADD CONSTRAINT "payment_sessions_payment_instrument_id_payment_instruments_id_fk" FOREIGN KEY ("payment_instrument_id") REFERENCES "public"."payment_instruments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_sessions" ADD CONSTRAINT "payment_sessions_payment_authorization_id_payment_authorizations_id_fk" FOREIGN KEY ("payment_authorization_id") REFERENCES "public"."payment_authorizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_sessions" ADD CONSTRAINT "payment_sessions_payment_capture_id_payment_captures_id_fk" FOREIGN KEY ("payment_capture_id") REFERENCES "public"."payment_captures"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_sessions" ADD CONSTRAINT "payment_sessions_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_note_line_items" ADD CONSTRAINT "credit_note_line_items_credit_note_id_credit_notes_id_fk" FOREIGN KEY ("credit_note_id") REFERENCES "public"."credit_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_booking_payment_schedule_id_booking_payment_schedules_id_fk" FOREIGN KEY ("booking_payment_schedule_id") REFERENCES "public"."booking_payment_schedules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_payment_instrument_id_payment_instruments_id_fk" FOREIGN KEY ("payment_instrument_id") REFERENCES "public"."payment_instruments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_payment_authorization_id_payment_authorizations_id_fk" FOREIGN KEY ("payment_authorization_id") REFERENCES "public"."payment_authorizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_payment_capture_id_payment_captures_id_fk" FOREIGN KEY ("payment_capture_id") REFERENCES "public"."payment_captures"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_cost_allocations" ADD CONSTRAINT "supplier_cost_allocations_supplier_invoice_id_supplier_invoices_id_fk" FOREIGN KEY ("supplier_invoice_id") REFERENCES "public"."supplier_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_cost_allocations" ADD CONSTRAINT "supplier_cost_allocations_supplier_invoice_line_id_supplier_invoice_lines_id_fk" FOREIGN KEY ("supplier_invoice_line_id") REFERENCES "public"."supplier_invoice_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_invoice_attachments" ADD CONSTRAINT "supplier_invoice_attachments_supplier_invoice_id_supplier_invoices_id_fk" FOREIGN KEY ("supplier_invoice_id") REFERENCES "public"."supplier_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_invoice_lines" ADD CONSTRAINT "supplier_invoice_lines_supplier_invoice_id_supplier_invoices_id_fk" FOREIGN KEY ("supplier_invoice_id") REFERENCES "public"."supplier_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_invoice_lines" ADD CONSTRAINT "supplier_invoice_lines_cost_category_id_cost_categories_id_fk" FOREIGN KEY ("cost_category_id") REFERENCES "public"."cost_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_supplier_invoice_id_supplier_invoices_id_fk" FOREIGN KEY ("supplier_invoice_id") REFERENCES "public"."supplier_invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_payment_instrument_id_payment_instruments_id_fk" FOREIGN KEY ("payment_instrument_id") REFERENCES "public"."payment_instruments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voucher_redemptions" ADD CONSTRAINT "voucher_redemptions_voucher_id_vouchers_id_fk" FOREIGN KEY ("voucher_id") REFERENCES "public"."vouchers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocation_audit_log" ADD CONSTRAINT "allocation_audit_log_slot_id_availability_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."availability_slots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocation_resources" ADD CONSTRAINT "allocation_resources_slot_id_availability_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."availability_slots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_closeouts" ADD CONSTRAINT "availability_closeouts_slot_id_availability_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."availability_slots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_slots" ADD CONSTRAINT "availability_slots_availability_rule_id_availability_rules_id_fk" FOREIGN KEY ("availability_rule_id") REFERENCES "public"."availability_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_slots" ADD CONSTRAINT "availability_slots_start_time_id_availability_start_times_id_fk" FOREIGN KEY ("start_time_id") REFERENCES "public"."availability_start_times"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_holds" ADD CONSTRAINT "availability_holds_slot_id_availability_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."availability_slots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_slot_pickups" ADD CONSTRAINT "availability_slot_pickups_slot_id_availability_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."availability_slots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_slot_pickups" ADD CONSTRAINT "availability_slot_pickups_pickup_point_id_availability_pickup_points_id_fk" FOREIGN KEY ("pickup_point_id") REFERENCES "public"."availability_pickup_points"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_pickup_areas" ADD CONSTRAINT "custom_pickup_areas_meeting_config_id_product_meeting_configs_id_fk" FOREIGN KEY ("meeting_config_id") REFERENCES "public"."product_meeting_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_pickup_times" ADD CONSTRAINT "location_pickup_times_pickup_location_id_pickup_locations_id_fk" FOREIGN KEY ("pickup_location_id") REFERENCES "public"."pickup_locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_pickup_times" ADD CONSTRAINT "location_pickup_times_slot_id_availability_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."availability_slots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_pickup_times" ADD CONSTRAINT "location_pickup_times_start_time_id_availability_start_times_id_fk" FOREIGN KEY ("start_time_id") REFERENCES "public"."availability_start_times"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_groups" ADD CONSTRAINT "pickup_groups_meeting_config_id_product_meeting_configs_id_fk" FOREIGN KEY ("meeting_config_id") REFERENCES "public"."product_meeting_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_locations" ADD CONSTRAINT "pickup_locations_group_id_pickup_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."pickup_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ground_dispatches" ADD CONSTRAINT "ground_dispatches_transfer_preference_id_ground_transfer_preferences_id_fk" FOREIGN KEY ("transfer_preference_id") REFERENCES "public"."ground_transfer_preferences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ground_dispatches" ADD CONSTRAINT "ground_dispatches_operator_id_ground_operators_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."ground_operators"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ground_dispatches" ADD CONSTRAINT "ground_dispatches_vehicle_id_ground_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."ground_vehicles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ground_dispatches" ADD CONSTRAINT "ground_dispatches_driver_id_ground_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."ground_drivers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ground_transfer_preferences" ADD CONSTRAINT "ground_transfer_preferences_pickup_address_id_identity_addresses_id_fk" FOREIGN KEY ("pickup_address_id") REFERENCES "public"."identity_addresses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ground_transfer_preferences" ADD CONSTRAINT "ground_transfer_preferences_dropoff_address_id_identity_addresses_id_fk" FOREIGN KEY ("dropoff_address_id") REFERENCES "public"."identity_addresses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ground_dispatch_assignments" ADD CONSTRAINT "ground_dispatch_assignments_dispatch_id_ground_dispatches_id_fk" FOREIGN KEY ("dispatch_id") REFERENCES "public"."ground_dispatches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ground_dispatch_assignments" ADD CONSTRAINT "ground_dispatch_assignments_operator_id_ground_operators_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."ground_operators"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ground_dispatch_assignments" ADD CONSTRAINT "ground_dispatch_assignments_vehicle_id_ground_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."ground_vehicles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ground_dispatch_assignments" ADD CONSTRAINT "ground_dispatch_assignments_driver_id_ground_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."ground_drivers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ground_dispatch_checkpoints" ADD CONSTRAINT "ground_dispatch_checkpoints_dispatch_id_ground_dispatches_id_fk" FOREIGN KEY ("dispatch_id") REFERENCES "public"."ground_dispatches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ground_dispatch_checkpoints" ADD CONSTRAINT "ground_dispatch_checkpoints_address_id_identity_addresses_id_fk" FOREIGN KEY ("address_id") REFERENCES "public"."identity_addresses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ground_dispatch_legs" ADD CONSTRAINT "ground_dispatch_legs_dispatch_id_ground_dispatches_id_fk" FOREIGN KEY ("dispatch_id") REFERENCES "public"."ground_dispatches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ground_dispatch_legs" ADD CONSTRAINT "ground_dispatch_legs_address_id_identity_addresses_id_fk" FOREIGN KEY ("address_id") REFERENCES "public"."identity_addresses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ground_dispatch_passengers" ADD CONSTRAINT "ground_dispatch_passengers_dispatch_id_ground_dispatches_id_fk" FOREIGN KEY ("dispatch_id") REFERENCES "public"."ground_dispatches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ground_driver_shifts" ADD CONSTRAINT "ground_driver_shifts_driver_id_ground_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."ground_drivers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ground_driver_shifts" ADD CONSTRAINT "ground_driver_shifts_operator_id_ground_operators_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."ground_operators"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ground_execution_events" ADD CONSTRAINT "ground_execution_events_dispatch_id_ground_dispatches_id_fk" FOREIGN KEY ("dispatch_id") REFERENCES "public"."ground_dispatches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ground_execution_events" ADD CONSTRAINT "ground_execution_events_address_id_identity_addresses_id_fk" FOREIGN KEY ("address_id") REFERENCES "public"."identity_addresses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ground_service_incidents" ADD CONSTRAINT "ground_service_incidents_dispatch_id_ground_dispatches_id_fk" FOREIGN KEY ("dispatch_id") REFERENCES "public"."ground_dispatches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ground_drivers" ADD CONSTRAINT "ground_drivers_operator_id_ground_operators_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."ground_operators"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ground_vehicles" ADD CONSTRAINT "ground_vehicles_operator_id_ground_operators_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."ground_operators"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facilities" ADD CONSTRAINT "facilities_parent_facility_id_facilities_id_fk" FOREIGN KEY ("parent_facility_id") REFERENCES "public"."facilities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facility_address_projections" ADD CONSTRAINT "facility_address_projections_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facility_features" ADD CONSTRAINT "facility_features_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facility_operation_schedules" ADD CONSTRAINT "facility_operation_schedules_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_group_members" ADD CONSTRAINT "property_group_members_group_id_property_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."property_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_group_members" ADD CONSTRAINT "property_group_members_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_groups" ADD CONSTRAINT "property_groups_parent_group_id_property_groups_id_fk" FOREIGN KEY ("parent_group_id") REFERENCES "public"."property_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_requirements" ADD CONSTRAINT "resource_requirements_pool_id_resource_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."resource_pools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_closeouts" ADD CONSTRAINT "resource_closeouts_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_pool_members" ADD CONSTRAINT "resource_pool_members_pool_id_resource_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."resource_pools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_pool_members" ADD CONSTRAINT "resource_pool_members_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_slot_assignments" ADD CONSTRAINT "resource_slot_assignments_pool_id_resource_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."resource_pools"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_slot_assignments" ADD CONSTRAINT "resource_slot_assignments_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_template_id_notification_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."notification_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_reminder_rule_authoring_requests" ADD CONSTRAINT "notification_reminder_rule_authoring_requests_reminder_rule_id_notification_reminder_rules_id_fk" FOREIGN KEY ("reminder_rule_id") REFERENCES "public"."notification_reminder_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_reminder_rule_stages" ADD CONSTRAINT "notification_reminder_rule_stages_reminder_rule_id_notification_reminder_rules_id_fk" FOREIGN KEY ("reminder_rule_id") REFERENCES "public"."notification_reminder_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_reminder_rules" ADD CONSTRAINT "notification_reminder_rules_template_id_notification_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."notification_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_reminder_runs" ADD CONSTRAINT "notification_reminder_runs_reminder_rule_id_notification_reminder_rules_id_fk" FOREIGN KEY ("reminder_rule_id") REFERENCES "public"."notification_reminder_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_reminder_runs" ADD CONSTRAINT "notification_reminder_runs_notification_delivery_id_notification_deliveries_id_fk" FOREIGN KEY ("notification_delivery_id") REFERENCES "public"."notification_deliveries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_reminder_stage_channels" ADD CONSTRAINT "notification_reminder_stage_channels_stage_id_notification_reminder_rule_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."notification_reminder_rule_stages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_reminder_stage_channels" ADD CONSTRAINT "notification_reminder_stage_channels_template_id_notification_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."notification_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_attachments" ADD CONSTRAINT "contract_attachments_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_signatures" ADD CONSTRAINT "contract_signatures_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_signatures" ADD CONSTRAINT "contract_signatures_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_template_versions" ADD CONSTRAINT "contract_template_versions_template_id_contract_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."contract_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_template_version_id_contract_template_versions_id_fk" FOREIGN KEY ("template_version_id") REFERENCES "public"."contract_template_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_series_id_contract_number_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."contract_number_series"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_acceptances" ADD CONSTRAINT "policy_acceptances_policy_version_id_policy_versions_id_fk" FOREIGN KEY ("policy_version_id") REFERENCES "public"."policy_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_assignments" ADD CONSTRAINT "policy_assignments_policy_id_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."policies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_rules" ADD CONSTRAINT "policy_rules_policy_version_id_policy_versions_id_fk" FOREIGN KEY ("policy_version_id") REFERENCES "public"."policy_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_versions" ADD CONSTRAINT "policy_versions_policy_id_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."policies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_terms" ADD CONSTRAINT "legal_terms_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_terms" ADD CONSTRAINT "legal_terms_policy_version_id_policy_versions_id_fk" FOREIGN KEY ("policy_version_id") REFERENCES "public"."policy_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_component_events" ADD CONSTRAINT "trip_component_events_envelope_id_trip_envelopes_id_fk" FOREIGN KEY ("envelope_id") REFERENCES "public"."trip_envelopes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_component_events" ADD CONSTRAINT "trip_component_events_component_id_trip_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."trip_components"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_components" ADD CONSTRAINT "trip_components_envelope_id_trip_envelopes_id_fk" FOREIGN KEY ("envelope_id") REFERENCES "public"."trip_envelopes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_reservation_plans" ADD CONSTRAINT "trip_reservation_plans_envelope_id_trip_envelopes_id_fk" FOREIGN KEY ("envelope_id") REFERENCES "public"."trip_envelopes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_reservation_plans" ADD CONSTRAINT "trip_reservation_plans_snapshot_id_trip_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."trip_snapshots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_snapshots" ADD CONSTRAINT "trip_snapshots_envelope_id_trip_envelopes_id_fk" FOREIGN KEY ("envelope_id") REFERENCES "public"."trip_envelopes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_run_steps" ADD CONSTRAINT "workflow_run_steps_run_id_workflow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_booking_items" ADD CONSTRAINT "stay_booking_items_booking_item_id_booking_items_id_fk" FOREIGN KEY ("booking_item_id") REFERENCES "public"."booking_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_booking_items" ADD CONSTRAINT "stay_booking_items_room_type_id_room_types_id_fk" FOREIGN KEY ("room_type_id") REFERENCES "public"."room_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_booking_items" ADD CONSTRAINT "stay_booking_items_rate_plan_id_rate_plans_id_fk" FOREIGN KEY ("rate_plan_id") REFERENCES "public"."rate_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_booking_items" ADD CONSTRAINT "stay_booking_items_meal_plan_id_meal_plans_id_fk" FOREIGN KEY ("meal_plan_id") REFERENCES "public"."meal_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_daily_rates" ADD CONSTRAINT "stay_daily_rates_stay_booking_item_id_stay_booking_items_id_fk" FOREIGN KEY ("stay_booking_item_id") REFERENCES "public"."stay_booking_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_plan_room_types" ADD CONSTRAINT "rate_plan_room_types_rate_plan_id_rate_plans_id_fk" FOREIGN KEY ("rate_plan_id") REFERENCES "public"."rate_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_plan_room_types" ADD CONSTRAINT "rate_plan_room_types_room_type_id_room_types_id_fk" FOREIGN KEY ("room_type_id") REFERENCES "public"."room_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_plans" ADD CONSTRAINT "rate_plans_meal_plan_id_meal_plans_id_fk" FOREIGN KEY ("meal_plan_id") REFERENCES "public"."meal_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_type_bed_configs" ADD CONSTRAINT "room_type_bed_configs_room_type_id_room_types_id_fk" FOREIGN KEY ("room_type_id") REFERENCES "public"."room_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charter_products" ADD CONSTRAINT "charter_products_default_yacht_id_charter_yachts_id_fk" FOREIGN KEY ("default_yacht_id") REFERENCES "public"."charter_yachts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charter_voyages" ADD CONSTRAINT "charter_voyages_product_id_charter_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."charter_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charter_voyages" ADD CONSTRAINT "charter_voyages_yacht_id_charter_yachts_id_fk" FOREIGN KEY ("yacht_id") REFERENCES "public"."charter_yachts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charter_schedule_days" ADD CONSTRAINT "charter_schedule_days_voyage_id_charter_voyages_id_fk" FOREIGN KEY ("voyage_id") REFERENCES "public"."charter_voyages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charter_suites" ADD CONSTRAINT "charter_suites_voyage_id_charter_voyages_id_fk" FOREIGN KEY ("voyage_id") REFERENCES "public"."charter_voyages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cruise_cabin_categories" ADD CONSTRAINT "cruise_cabin_categories_ship_id_cruise_ships_id_fk" FOREIGN KEY ("ship_id") REFERENCES "public"."cruise_ships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cruise_cabins" ADD CONSTRAINT "cruise_cabins_category_id_cruise_cabin_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."cruise_cabin_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cruise_cabins" ADD CONSTRAINT "cruise_cabins_deck_id_cruise_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."cruise_decks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cruise_decks" ADD CONSTRAINT "cruise_decks_ship_id_cruise_ships_id_fk" FOREIGN KEY ("ship_id") REFERENCES "public"."cruise_ships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cruise_enrichment_programs" ADD CONSTRAINT "cruise_enrichment_programs_cruise_id_cruises_id_fk" FOREIGN KEY ("cruise_id") REFERENCES "public"."cruises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cruise_inclusions" ADD CONSTRAINT "cruise_inclusions_cruise_id_cruises_id_fk" FOREIGN KEY ("cruise_id") REFERENCES "public"."cruises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cruise_media" ADD CONSTRAINT "cruise_media_cruise_id_cruises_id_fk" FOREIGN KEY ("cruise_id") REFERENCES "public"."cruises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cruise_media" ADD CONSTRAINT "cruise_media_sailing_id_cruise_sailings_id_fk" FOREIGN KEY ("sailing_id") REFERENCES "public"."cruise_sailings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cruise_sailings" ADD CONSTRAINT "cruise_sailings_cruise_id_cruises_id_fk" FOREIGN KEY ("cruise_id") REFERENCES "public"."cruises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cruise_sailings" ADD CONSTRAINT "cruise_sailings_ship_id_cruise_ships_id_fk" FOREIGN KEY ("ship_id") REFERENCES "public"."cruise_ships"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cruise_voyage_group_segments" ADD CONSTRAINT "cruise_voyage_group_segments_voyage_group_id_cruise_voyage_groups_id_fk" FOREIGN KEY ("voyage_group_id") REFERENCES "public"."cruise_voyage_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cruise_voyage_group_segments" ADD CONSTRAINT "cruise_voyage_group_segments_cruise_id_cruises_id_fk" FOREIGN KEY ("cruise_id") REFERENCES "public"."cruises"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cruise_voyage_group_segments" ADD CONSTRAINT "cruise_voyage_group_segments_sailing_id_cruise_sailings_id_fk" FOREIGN KEY ("sailing_id") REFERENCES "public"."cruise_sailings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cruises" ADD CONSTRAINT "cruises_default_ship_id_cruise_ships_id_fk" FOREIGN KEY ("default_ship_id") REFERENCES "public"."cruise_ships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cruise_days" ADD CONSTRAINT "cruise_days_cruise_id_cruises_id_fk" FOREIGN KEY ("cruise_id") REFERENCES "public"."cruises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cruise_sailing_days" ADD CONSTRAINT "cruise_sailing_days_sailing_id_cruise_sailings_id_fk" FOREIGN KEY ("sailing_id") REFERENCES "public"."cruise_sailings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cruise_price_components" ADD CONSTRAINT "cruise_price_components_price_id_cruise_prices_id_fk" FOREIGN KEY ("price_id") REFERENCES "public"."cruise_prices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cruise_prices" ADD CONSTRAINT "cruise_prices_sailing_id_cruise_sailings_id_fk" FOREIGN KEY ("sailing_id") REFERENCES "public"."cruise_sailings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cruise_prices" ADD CONSTRAINT "cruise_prices_cabin_category_id_cruise_cabin_categories_id_fk" FOREIGN KEY ("cabin_category_id") REFERENCES "public"."cruise_cabin_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cruise_search_index" ADD CONSTRAINT "cruise_search_index_local_cruise_id_cruises_id_fk" FOREIGN KEY ("local_cruise_id") REFERENCES "public"."cruises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_aggregate_snapshots_stale_after" ON "aggregate_snapshots" USING btree ("stale_after");--> statement-breakpoint
CREATE INDEX "idx_apikey_reference_id" ON "apikey" USING btree ("reference_id");--> statement-breakpoint
CREATE INDEX "idx_apikey_config_id" ON "apikey" USING btree ("config_id");--> statement-breakpoint
CREATE UNIQUE INDEX "account_provider_account_unique" ON "account" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "idx_invitation_email" ON "invitation" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_invitation_organization_id" ON "invitation" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_member_user_id" ON "member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_member_organization_id" ON "member" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_member_user_organization" ON "member" USING btree ("user_id","organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_email_unique" ON "user" USING btree ("email") WHERE "user"."email" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "user_phone_unique" ON "user" USING btree ("phone_number") WHERE "user"."phone_number" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_cloud_auth_session_user" ON "cloud_auth_session_links" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_cloud_auth_session_revalidate_after" ON "cloud_auth_session_links" USING btree ("revalidate_after");--> statement-breakpoint
CREATE INDEX "idx_cloud_auth_session_revoked_at" ON "cloud_auth_session_links" USING btree ("revoked_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cloud_auth_user_provider_account_unique" ON "cloud_auth_user_links" USING btree ("provider_id","provider_account_id");--> statement-breakpoint
CREATE INDEX "idx_cloud_auth_user_deployment" ON "cloud_auth_user_links" USING btree ("deployment_id");--> statement-breakpoint
CREATE INDEX "idx_cloud_auth_user_revalidation" ON "cloud_auth_user_links" USING btree ("revoked_at","last_revalidated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_user_invitations_token_hash" ON "user_invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "idx_user_invitations_email" ON "user_invitations" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_user_invitations_redeemed_at" ON "user_invitations" USING btree ("redeemed_at");--> statement-breakpoint
CREATE INDEX "idx_user_invitations_expires_at" ON "user_invitations" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_user_profiles_name" ON "user_profiles" USING btree ("first_name","last_name");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_infra_domains_domain" ON "domains" USING btree (lower("domain"));--> statement-breakpoint
CREATE INDEX "idx_infra_domains_status" ON "domains" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_infra_domains_provider" ON "domains" USING btree ("provider");--> statement-breakpoint
CREATE UNIQUE INDEX "event_outbox_event_id_uniq" ON "event_outbox" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "event_outbox_due_idx" ON "event_outbox" USING btree ("next_attempt_at") WHERE "event_outbox"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "event_outbox_created_idx" ON "event_outbox" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_infra_idempotency_keys_scope_key" ON "idempotency_keys" USING btree ("scope","key");--> statement-breakpoint
CREATE INDEX "idx_infra_idempotency_keys_expires_at" ON "idempotency_keys" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_public_document_delivery_grants_token_hash" ON "public_document_delivery_grants" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "idx_public_document_delivery_grants_expires_at" ON "public_document_delivery_grants" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_public_document_delivery_grants_source" ON "public_document_delivery_grants" USING btree ("source_module","source_entity","source_id");--> statement-breakpoint
CREATE INDEX "idx_public_document_delivery_grants_revoked_at" ON "public_document_delivery_grants" USING btree ("revoked_at");--> statement-breakpoint
CREATE INDEX "idx_webhook_deliveries_pending" ON "webhook_deliveries" USING btree ("status","scheduled_for");--> statement-breakpoint
CREATE INDEX "idx_webhook_deliveries_module" ON "webhook_deliveries" USING btree ("source_module","created_at");--> statement-breakpoint
CREATE INDEX "idx_webhook_deliveries_entity" ON "webhook_deliveries" USING btree ("source_entity_module","source_entity_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_webhook_deliveries_idempotency" ON "webhook_deliveries" USING btree ("idempotency_key","attempt_number");--> statement-breakpoint
CREATE INDEX "idx_webhook_deliveries_subscription" ON "webhook_deliveries" USING btree ("subscription_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_webhook_deliveries_target" ON "webhook_deliveries" USING btree ("target_kind","target_ref","created_at");--> statement-breakpoint
CREATE INDEX "idx_infra_webhook_subs_active" ON "webhook_subscriptions" USING btree ("active");--> statement-breakpoint
CREATE INDEX "idx_infra_webhook_subs_url" ON "webhook_subscriptions" USING btree ("url");--> statement-breakpoint
CREATE UNIQUE INDEX "write_intents_idempotency_key_uniq" ON "write_intents" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "write_intents_pending_idx" ON "write_intents" USING btree ("created_at") WHERE "write_intents"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "idx_action_approvals_requested_action" ON "action_approvals" USING btree ("requested_action_id");--> statement-breakpoint
CREATE INDEX "idx_action_approvals_status_expires" ON "action_approvals" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "idx_action_approvals_assignee" ON "action_approvals" USING btree ("assigned_to_principal_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_action_delegations_root" ON "action_delegations" USING btree ("root_principal_type","root_principal_id");--> statement-breakpoint
CREATE INDEX "idx_action_delegations_child" ON "action_delegations" USING btree ("child_principal_type","child_principal_id");--> statement-breakpoint
CREATE INDEX "idx_action_delegations_parent" ON "action_delegations" USING btree ("parent_principal_type","parent_principal_id");--> statement-breakpoint
CREATE INDEX "idx_action_ledger_entries_principal" ON "action_ledger_entries" USING btree ("principal_type","principal_id","occurred_at");--> statement-breakpoint
CREATE INDEX "idx_action_ledger_entries_api_token" ON "action_ledger_entries" USING btree ("api_token_id","occurred_at");--> statement-breakpoint
CREATE INDEX "idx_action_ledger_entries_session" ON "action_ledger_entries" USING btree ("session_id","occurred_at");--> statement-breakpoint
CREATE INDEX "idx_action_ledger_entries_target" ON "action_ledger_entries" USING btree ("target_type","target_id","occurred_at");--> statement-breakpoint
CREATE INDEX "idx_action_ledger_entries_workflow" ON "action_ledger_entries" USING btree ("workflow_run_id","workflow_step_id","occurred_at");--> statement-breakpoint
CREATE INDEX "idx_action_ledger_entries_correlation" ON "action_ledger_entries" USING btree ("correlation_id","occurred_at");--> statement-breakpoint
CREATE INDEX "idx_action_ledger_entries_causation" ON "action_ledger_entries" USING btree ("causation_action_id");--> statement-breakpoint
CREATE INDEX "idx_action_ledger_entries_control_state" ON "action_ledger_entries" USING btree ("evaluated_risk","status","occurred_at");--> statement-breakpoint
CREATE INDEX "idx_action_ledger_entries_capability" ON "action_ledger_entries" USING btree ("capability_id","capability_version","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_action_ledger_entries_idempotency" ON "action_ledger_entries" USING btree ("idempotency_scope","action_name","target_type","target_id","idempotency_key") WHERE 
        "action_ledger_entries"."idempotency_key" IS NOT NULL
      ;--> statement-breakpoint
CREATE INDEX "idx_action_ledger_payloads_action" ON "action_ledger_payloads" USING btree ("action_id");--> statement-breakpoint
CREATE INDEX "idx_action_ledger_payloads_expiry" ON "action_ledger_payloads" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_action_ledger_outbox_action" ON "action_ledger_outbox" USING btree ("action_id");--> statement-breakpoint
CREATE INDEX "idx_action_ledger_outbox_status_retry" ON "action_ledger_outbox" USING btree ("relay_status","next_retry_at");--> statement-breakpoint
CREATE INDEX "idx_action_mutation_details_reverses" ON "action_mutation_details" USING btree ("reverses_action_id");--> statement-breakpoint
CREATE INDEX "idx_action_mutation_details_reversal_state" ON "action_mutation_details" USING btree ("reversal_state_projection");--> statement-breakpoint
CREATE INDEX "idx_communication_log_person" ON "communication_log" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "idx_communication_log_person_created" ON "communication_log" USING btree ("person_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_communication_log_person_channel_created" ON "communication_log" USING btree ("person_id","channel","created_at");--> statement-breakpoint
CREATE INDEX "idx_communication_log_person_direction_created" ON "communication_log" USING btree ("person_id","direction","created_at");--> statement-breakpoint
CREATE INDEX "idx_communication_log_org" ON "communication_log" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_communication_log_channel" ON "communication_log" USING btree ("channel");--> statement-breakpoint
CREATE INDEX "idx_organization_notes_org" ON "organization_notes" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_organization_notes_org_created" ON "organization_notes" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_organizations_name" ON "organizations" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_organizations_owner" ON "organizations" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "idx_organizations_status" ON "organizations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_organizations_tax_id" ON "organizations" USING btree ("tax_id");--> statement-breakpoint
CREATE INDEX "idx_organizations_owner_updated" ON "organizations" USING btree ("owner_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_organizations_relation_updated" ON "organizations" USING btree ("relation","updated_at");--> statement-breakpoint
CREATE INDEX "idx_organizations_status_updated" ON "organizations" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "idx_people_org" ON "people" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_people_owner" ON "people" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "idx_people_status" ON "people" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_people_name" ON "people" USING btree ("first_name","last_name");--> statement-breakpoint
CREATE INDEX "idx_people_org_updated" ON "people" USING btree ("organization_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_people_owner_updated" ON "people" USING btree ("owner_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_people_relation_updated" ON "people" USING btree ("relation","updated_at");--> statement-breakpoint
CREATE INDEX "idx_people_status_updated" ON "people" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "idx_person_documents_person" ON "person_documents" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "idx_person_documents_person_type" ON "person_documents" USING btree ("person_id","type");--> statement-breakpoint
CREATE INDEX "idx_person_documents_expiry" ON "person_documents" USING btree ("expiry_date");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_person_documents_primary_per_type" ON "person_documents" USING btree ("person_id","type") WHERE "person_documents"."is_primary" = true;--> statement-breakpoint
CREATE INDEX "idx_person_notes_person" ON "person_notes" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "idx_person_notes_person_created" ON "person_notes" USING btree ("person_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_person_payment_methods_person" ON "person_payment_methods" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "idx_person_payment_methods_person_default" ON "person_payment_methods" USING btree ("person_id","is_default");--> statement-breakpoint
CREATE INDEX "idx_person_relationships_from" ON "person_relationships" USING btree ("from_person_id");--> statement-breakpoint
CREATE INDEX "idx_person_relationships_to" ON "person_relationships" USING btree ("to_person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_person_relationships_pair_kind" ON "person_relationships" USING btree ("from_person_id","to_person_id","kind");--> statement-breakpoint
CREATE INDEX "idx_segment_members_segment" ON "segment_members" USING btree ("segment_id");--> statement-breakpoint
CREATE INDEX "idx_segment_members_person" ON "segment_members" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "idx_segments_created" ON "segments" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_activities_owner" ON "activities" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "idx_activities_status" ON "activities" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_activities_type" ON "activities" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_activities_owner_updated" ON "activities" USING btree ("owner_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_activities_status_updated" ON "activities" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "idx_activities_type_updated" ON "activities" USING btree ("type","updated_at");--> statement-breakpoint
CREATE INDEX "idx_activity_links_activity" ON "activity_links" USING btree ("activity_id");--> statement-breakpoint
CREATE INDEX "idx_activity_links_activity_role" ON "activity_links" USING btree ("activity_id","role","created_at");--> statement-breakpoint
CREATE INDEX "idx_activity_links_entity" ON "activity_links" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_activity_participants_activity" ON "activity_participants" USING btree ("activity_id");--> statement-breakpoint
CREATE INDEX "idx_activity_participants_activity_primary" ON "activity_participants" USING btree ("activity_id","is_primary","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_activity_participants_unique" ON "activity_participants" USING btree ("activity_id","person_id");--> statement-breakpoint
CREATE INDEX "idx_custom_field_definitions_entity" ON "custom_field_definitions" USING btree ("entity_type");--> statement-breakpoint
CREATE INDEX "idx_custom_field_definitions_entity_label" ON "custom_field_definitions" USING btree ("entity_type","label");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_custom_field_definitions_key" ON "custom_field_definitions" USING btree ("entity_type","key");--> statement-breakpoint
CREATE INDEX "idx_custom_field_values_entity" ON "custom_field_values" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_custom_field_values_entity_type_updated" ON "custom_field_values" USING btree ("entity_type","updated_at");--> statement-breakpoint
CREATE INDEX "idx_custom_field_values_entity_updated" ON "custom_field_values" USING btree ("entity_type","entity_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_custom_field_values_definition_updated" ON "custom_field_values" USING btree ("definition_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_custom_field_values_unique" ON "custom_field_values" USING btree ("definition_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_customer_signals_person_status_created" ON "customer_signals" USING btree ("person_id","status","created_at");--> statement-breakpoint
CREATE INDEX "idx_customer_signals_assignee_status" ON "customer_signals" USING btree ("assigned_to_user_id","status");--> statement-breakpoint
CREATE INDEX "idx_customer_signals_kind" ON "customer_signals" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "idx_customer_signals_resolved_booking" ON "customer_signals" USING btree ("resolved_booking_id");--> statement-breakpoint
CREATE INDEX "idx_booking_proposal_details_proposal" ON "booking_proposal_details" USING btree ("proposal_id");--> statement-breakpoint
CREATE INDEX "idx_booking_proposal_details_proposal_version" ON "booking_proposal_details" USING btree ("proposal_version_id");--> statement-breakpoint
CREATE INDEX "idx_pipelines_entity" ON "pipelines" USING btree ("entity_type");--> statement-breakpoint
CREATE INDEX "idx_pipelines_sort" ON "pipelines" USING btree ("sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_pipelines_entity_sort" ON "pipelines" USING btree ("entity_type","sort_order","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_pipelines_entity_name" ON "pipelines" USING btree ("entity_type","name");--> statement-breakpoint
CREATE INDEX "idx_proposal_delivery_requests_proposal" ON "proposal_delivery_requests" USING btree ("proposal_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_proposal_delivery_requests_version" ON "proposal_delivery_requests" USING btree ("proposal_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_proposal_delivery_requests_command" ON "proposal_delivery_requests" USING btree ("command_scope","command_idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_proposal_delivery_requests_claim" ON "proposal_delivery_requests" USING btree ("claim_action_id");--> statement-breakpoint
CREATE INDEX "idx_proposal_participants_proposal" ON "proposal_participants" USING btree ("proposal_id");--> statement-breakpoint
CREATE INDEX "idx_proposal_participants_proposal_primary" ON "proposal_participants" USING btree ("proposal_id","is_primary","created_at");--> statement-breakpoint
CREATE INDEX "idx_proposal_participants_person" ON "proposal_participants" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_proposal_participants_unique" ON "proposal_participants" USING btree ("proposal_id","person_id");--> statement-breakpoint
CREATE INDEX "idx_proposal_products_proposal" ON "proposal_products" USING btree ("proposal_id");--> statement-breakpoint
CREATE INDEX "idx_proposal_products_proposal_created" ON "proposal_products" USING btree ("proposal_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_proposal_products_product" ON "proposal_products" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_proposal_products_supplier_service" ON "proposal_products" USING btree ("supplier_service_id");--> statement-breakpoint
CREATE INDEX "idx_proposal_version_lines_version" ON "proposal_version_lines" USING btree ("proposal_version_id");--> statement-breakpoint
CREATE INDEX "idx_proposal_version_lines_version_created" ON "proposal_version_lines" USING btree ("proposal_version_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_proposal_version_lines_product" ON "proposal_version_lines" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_proposal_version_lines_supplier_service" ON "proposal_version_lines" USING btree ("supplier_service_id");--> statement-breakpoint
CREATE INDEX "idx_proposal_versions_proposal" ON "proposal_versions" USING btree ("proposal_id");--> statement-breakpoint
CREATE INDEX "idx_proposal_versions_status" ON "proposal_versions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_proposal_versions_supersedes" ON "proposal_versions" USING btree ("supersedes_id");--> statement-breakpoint
CREATE INDEX "idx_proposal_versions_trip_snapshot" ON "proposal_versions" USING btree ("trip_snapshot_id");--> statement-breakpoint
CREATE INDEX "idx_proposal_versions_proposal_updated" ON "proposal_versions" USING btree ("proposal_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_proposal_versions_status_updated" ON "proposal_versions" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "idx_proposals_person" ON "proposals" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "idx_proposals_org" ON "proposals" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_proposals_pipeline" ON "proposals" USING btree ("pipeline_id");--> statement-breakpoint
CREATE INDEX "idx_proposals_stage" ON "proposals" USING btree ("stage_id");--> statement-breakpoint
CREATE INDEX "idx_proposals_owner" ON "proposals" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "idx_proposals_status" ON "proposals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_proposals_accepted_version" ON "proposals" USING btree ("accepted_version_id");--> statement-breakpoint
CREATE INDEX "idx_proposals_person_updated" ON "proposals" USING btree ("person_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_proposals_org_updated" ON "proposals" USING btree ("organization_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_proposals_pipeline_updated" ON "proposals" USING btree ("pipeline_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_proposals_stage_updated" ON "proposals" USING btree ("stage_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_proposals_owner_updated" ON "proposals" USING btree ("owner_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_proposals_status_updated" ON "proposals" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "idx_stages_pipeline" ON "stages" USING btree ("pipeline_id");--> statement-breakpoint
CREATE INDEX "idx_stages_sort" ON "stages" USING btree ("sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_stages_pipeline_sort" ON "stages" USING btree ("pipeline_id","sort_order","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_stages_pipeline_name" ON "stages" USING btree ("pipeline_id","name");--> statement-breakpoint
CREATE INDEX "idx_identity_addresses_entity" ON "identity_addresses" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_identity_addresses_entity_primary_created" ON "identity_addresses" USING btree ("entity_type","entity_id","is_primary","created_at");--> statement-breakpoint
CREATE INDEX "idx_identity_addresses_label" ON "identity_addresses" USING btree ("label");--> statement-breakpoint
CREATE INDEX "idx_identity_contact_points_entity" ON "identity_contact_points" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_identity_contact_points_entity_primary_created" ON "identity_contact_points" USING btree ("entity_type","entity_id","is_primary","created_at");--> statement-breakpoint
CREATE INDEX "idx_identity_contact_points_entity_kind_primary_created" ON "identity_contact_points" USING btree ("entity_type","entity_id","kind","is_primary","created_at");--> statement-breakpoint
CREATE INDEX "idx_identity_contact_points_kind" ON "identity_contact_points" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "idx_identity_contact_points_normalized" ON "identity_contact_points" USING btree ("normalized_value");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_identity_contact_points_entity_kind_value" ON "identity_contact_points" USING btree ("entity_type","entity_id","kind","value");--> statement-breakpoint
CREATE INDEX "idx_identity_named_contacts_entity" ON "identity_named_contacts" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_identity_named_contacts_entity_primary_created" ON "identity_named_contacts" USING btree ("entity_type","entity_id","is_primary","created_at");--> statement-breakpoint
CREATE INDEX "idx_identity_named_contacts_entity_role_primary_created" ON "identity_named_contacts" USING btree ("entity_type","entity_id","role","is_primary","created_at");--> statement-breakpoint
CREATE INDEX "idx_identity_named_contacts_role" ON "identity_named_contacts" USING btree ("role");--> statement-breakpoint
CREATE INDEX "idx_identity_named_contacts_primary" ON "identity_named_contacts" USING btree ("is_primary");--> statement-breakpoint
CREATE INDEX "idx_bdd_market" ON "booking_distribution_details" USING btree ("market_id");--> statement-breakpoint
CREATE INDEX "idx_bdd_source_channel" ON "booking_distribution_details" USING btree ("source_channel_id");--> statement-breakpoint
CREATE INDEX "idx_bdd_fx_rate_set" ON "booking_distribution_details" USING btree ("fx_rate_set_id");--> statement-breakpoint
CREATE INDEX "idx_external_refs_updated" ON "external_refs" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "idx_external_refs_entity_updated" ON "external_refs" USING btree ("entity_type","entity_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_external_refs_source_updated" ON "external_refs" USING btree ("source_system","object_type","updated_at");--> statement-breakpoint
CREATE INDEX "idx_external_refs_namespace_updated" ON "external_refs" USING btree ("namespace","updated_at");--> statement-breakpoint
CREATE INDEX "idx_external_refs_external_id" ON "external_refs" USING btree ("external_id");--> statement-breakpoint
CREATE INDEX "idx_external_refs_status_updated" ON "external_refs" USING btree ("status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_external_refs_entity_source_external" ON "external_refs" USING btree ("entity_type","entity_id","source_system","namespace","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_external_refs_source_object_external" ON "external_refs" USING btree ("source_system","object_type","namespace","external_id");--> statement-breakpoint
CREATE INDEX "idx_channel_reconciliation_policies_updated" ON "channel_reconciliation_policies" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "idx_channel_reconciliation_policies_channel_updated" ON "channel_reconciliation_policies" USING btree ("channel_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_channel_reconciliation_policies_contract_updated" ON "channel_reconciliation_policies" USING btree ("contract_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_channel_reconciliation_policies_frequency_updated" ON "channel_reconciliation_policies" USING btree ("frequency","updated_at");--> statement-breakpoint
CREATE INDEX "idx_channel_reconciliation_policies_active_updated" ON "channel_reconciliation_policies" USING btree ("active","updated_at");--> statement-breakpoint
CREATE INDEX "idx_channel_release_schedules_updated" ON "channel_release_schedules" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "idx_channel_release_schedules_rule_updated" ON "channel_release_schedules" USING btree ("release_rule_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_channel_release_schedules_kind_updated" ON "channel_release_schedules" USING btree ("schedule_kind","updated_at");--> statement-breakpoint
CREATE INDEX "idx_channel_release_schedules_active_updated" ON "channel_release_schedules" USING btree ("active","updated_at");--> statement-breakpoint
CREATE INDEX "idx_channel_settlement_policies_updated" ON "channel_settlement_policies" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "idx_channel_settlement_policies_channel_updated" ON "channel_settlement_policies" USING btree ("channel_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_channel_settlement_policies_contract_updated" ON "channel_settlement_policies" USING btree ("contract_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_channel_settlement_policies_frequency_updated" ON "channel_settlement_policies" USING btree ("frequency","updated_at");--> statement-breakpoint
CREATE INDEX "idx_channel_settlement_policies_active_updated" ON "channel_settlement_policies" USING btree ("active","updated_at");--> statement-breakpoint
CREATE INDEX "idx_channel_booking_links_channel_created" ON "channel_booking_links" USING btree ("channel_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_channel_booking_links_booking_created" ON "channel_booking_links" USING btree ("booking_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_channel_booking_links_external_booking_created" ON "channel_booking_links" USING btree ("external_booking_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_channel_booking_links_push_status" ON "channel_booking_links" USING btree ("push_status","last_push_at");--> statement-breakpoint
CREATE INDEX "idx_channel_booking_links_booking_item" ON "channel_booking_links" USING btree ("booking_item_id") WHERE "channel_booking_links"."booking_item_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_channel_booking_links_per_item" ON "channel_booking_links" USING btree ("channel_id","booking_id",COALESCE("booking_item_id", ''));--> statement-breakpoint
CREATE INDEX "idx_channel_commission_rules_contract_created" ON "channel_commission_rules" USING btree ("contract_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_channel_commission_rules_product_created" ON "channel_commission_rules" USING btree ("product_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_channel_commission_rules_scope_created" ON "channel_commission_rules" USING btree ("scope","created_at");--> statement-breakpoint
CREATE INDEX "idx_channel_contracts_channel_created" ON "channel_contracts" USING btree ("channel_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_channel_contracts_supplier_created" ON "channel_contracts" USING btree ("supplier_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_channel_contracts_status_created" ON "channel_contracts" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "idx_channel_product_mappings_channel_created" ON "channel_product_mappings" USING btree ("channel_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_channel_product_mappings_product_created" ON "channel_product_mappings" USING btree ("product_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_channel_product_mappings_active_created" ON "channel_product_mappings" USING btree ("active","created_at");--> statement-breakpoint
CREATE INDEX "idx_channel_product_mappings_source_connection" ON "channel_product_mappings" USING btree ("source_connection_id");--> statement-breakpoint
CREATE INDEX "idx_channel_webhook_events_channel_received" ON "channel_webhook_events" USING btree ("channel_id","received_at");--> statement-breakpoint
CREATE INDEX "idx_channel_webhook_events_status_received" ON "channel_webhook_events" USING btree ("status","received_at");--> statement-breakpoint
CREATE INDEX "idx_channel_webhook_events_event_type_received" ON "channel_webhook_events" USING btree ("event_type","received_at");--> statement-breakpoint
CREATE INDEX "idx_channel_webhook_events_external_event" ON "channel_webhook_events" USING btree ("external_event_id");--> statement-breakpoint
CREATE INDEX "idx_channels_created" ON "channels" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_channels_kind_created" ON "channels" USING btree ("kind","created_at");--> statement-breakpoint
CREATE INDEX "idx_channels_status_created" ON "channels" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "idx_channel_reconciliation_items_updated" ON "channel_reconciliation_items" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "idx_channel_reconciliation_items_run_updated" ON "channel_reconciliation_items" USING btree ("reconciliation_run_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_channel_reconciliation_items_booking_link_updated" ON "channel_reconciliation_items" USING btree ("booking_link_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_channel_reconciliation_items_booking_updated" ON "channel_reconciliation_items" USING btree ("booking_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_channel_reconciliation_items_issue_updated" ON "channel_reconciliation_items" USING btree ("issue_type","updated_at");--> statement-breakpoint
CREATE INDEX "idx_channel_reconciliation_items_resolution_updated" ON "channel_reconciliation_items" USING btree ("resolution_status","updated_at");--> statement-breakpoint
CREATE INDEX "idx_channel_reconciliation_runs_updated" ON "channel_reconciliation_runs" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "idx_channel_reconciliation_runs_channel_updated" ON "channel_reconciliation_runs" USING btree ("channel_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_channel_reconciliation_runs_contract_updated" ON "channel_reconciliation_runs" USING btree ("contract_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_channel_reconciliation_runs_status_updated" ON "channel_reconciliation_runs" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "idx_channel_remittance_exceptions_updated" ON "channel_remittance_exceptions" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "idx_channel_remittance_exceptions_channel_updated" ON "channel_remittance_exceptions" USING btree ("channel_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_channel_remittance_exceptions_settlement_item_updated" ON "channel_remittance_exceptions" USING btree ("settlement_item_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_channel_remittance_exceptions_reconciliation_item_updated" ON "channel_remittance_exceptions" USING btree ("reconciliation_item_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_channel_remittance_exceptions_status_updated" ON "channel_remittance_exceptions" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "idx_channel_settlement_approvals_updated" ON "channel_settlement_approvals" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "idx_channel_settlement_approvals_run_updated" ON "channel_settlement_approvals" USING btree ("settlement_run_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_channel_settlement_approvals_status_updated" ON "channel_settlement_approvals" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "idx_channel_settlement_items_updated" ON "channel_settlement_items" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "idx_channel_settlement_items_run_updated" ON "channel_settlement_items" USING btree ("settlement_run_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_channel_settlement_items_booking_link_updated" ON "channel_settlement_items" USING btree ("booking_link_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_channel_settlement_items_booking_updated" ON "channel_settlement_items" USING btree ("booking_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_channel_settlement_items_status_updated" ON "channel_settlement_items" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "idx_channel_settlement_runs_updated" ON "channel_settlement_runs" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "idx_channel_settlement_runs_channel_updated" ON "channel_settlement_runs" USING btree ("channel_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_channel_settlement_runs_contract_updated" ON "channel_settlement_runs" USING btree ("contract_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_channel_settlement_runs_status_updated" ON "channel_settlement_runs" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "idx_channel_settlement_runs_period" ON "channel_settlement_runs" USING btree ("period_start","period_end");--> statement-breakpoint
CREATE INDEX "idx_channel_inventory_allotment_targets_updated" ON "channel_inventory_allotment_targets" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "idx_channel_inventory_allotment_targets_allotment_updated" ON "channel_inventory_allotment_targets" USING btree ("allotment_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_channel_inventory_allotment_targets_slot_updated" ON "channel_inventory_allotment_targets" USING btree ("slot_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_channel_inventory_allotment_targets_start_time_updated" ON "channel_inventory_allotment_targets" USING btree ("start_time_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_channel_inventory_allotment_targets_date_updated" ON "channel_inventory_allotment_targets" USING btree ("date_local","updated_at");--> statement-breakpoint
CREATE INDEX "idx_channel_inventory_allotment_targets_active_updated" ON "channel_inventory_allotment_targets" USING btree ("active","updated_at");--> statement-breakpoint
CREATE INDEX "idx_channel_inventory_allotments_updated" ON "channel_inventory_allotments" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "idx_channel_inventory_allotments_channel_updated" ON "channel_inventory_allotments" USING btree ("channel_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_channel_inventory_allotments_contract_updated" ON "channel_inventory_allotments" USING btree ("contract_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_channel_inventory_allotments_product_updated" ON "channel_inventory_allotments" USING btree ("product_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_channel_inventory_allotments_option_updated" ON "channel_inventory_allotments" USING btree ("option_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_channel_inventory_allotments_start_time_updated" ON "channel_inventory_allotments" USING btree ("start_time_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_channel_inventory_allotments_active_updated" ON "channel_inventory_allotments" USING btree ("active","updated_at");--> statement-breakpoint
CREATE INDEX "idx_channel_inventory_release_executions_updated" ON "channel_inventory_release_executions" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "idx_channel_inventory_release_executions_allotment_updated" ON "channel_inventory_release_executions" USING btree ("allotment_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_channel_inventory_release_executions_rule_updated" ON "channel_inventory_release_executions" USING btree ("release_rule_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_channel_inventory_release_executions_target_updated" ON "channel_inventory_release_executions" USING btree ("target_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_channel_inventory_release_executions_slot_updated" ON "channel_inventory_release_executions" USING btree ("slot_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_channel_inventory_release_executions_status_updated" ON "channel_inventory_release_executions" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "idx_channel_inventory_release_rules_updated" ON "channel_inventory_release_rules" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "idx_channel_inventory_release_rules_allotment_updated" ON "channel_inventory_release_rules" USING btree ("allotment_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_channel_inventory_release_rules_mode_updated" ON "channel_inventory_release_rules" USING btree ("release_mode","updated_at");--> statement-breakpoint
CREATE INDEX "idx_chan_avail_push_intents_requested" ON "channel_availability_push_intents" USING btree ("channel_id","requested_at");--> statement-breakpoint
CREATE INDEX "idx_chan_avail_push_intents_product" ON "channel_availability_push_intents" USING btree ("product_id","requested_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_chan_avail_push_intents_per_slot" ON "channel_availability_push_intents" USING btree ("channel_id","slot_id");--> statement-breakpoint
CREATE INDEX "idx_chan_content_push_intents_requested" ON "channel_content_push_intents" USING btree ("channel_id","requested_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_chan_content_push_intents_per_product" ON "channel_content_push_intents" USING btree ("channel_id","product_id");--> statement-breakpoint
CREATE INDEX "idx_supplier_availability_supplier_date" ON "supplier_availability" USING btree ("supplier_id","date");--> statement-breakpoint
CREATE INDEX "idx_supplier_availability_date" ON "supplier_availability" USING btree ("date");--> statement-breakpoint
CREATE INDEX "idx_supplier_contracts_supplier_created" ON "supplier_contracts" USING btree ("supplier_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_supplier_contracts_status" ON "supplier_contracts" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_supplier_directory_projections_supplier" ON "supplier_directory_projections" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "idx_supplier_notes_supplier_created" ON "supplier_notes" USING btree ("supplier_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_supplier_rates_service_created" ON "supplier_rates" USING btree ("service_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_supplier_rates_validity" ON "supplier_rates" USING btree ("valid_from","valid_to");--> statement-breakpoint
CREATE INDEX "idx_supplier_services_supplier_created" ON "supplier_services" USING btree ("supplier_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_supplier_services_type" ON "supplier_services" USING btree ("service_type");--> statement-breakpoint
CREATE INDEX "idx_supplier_services_facility" ON "supplier_services" USING btree ("facility_id");--> statement-breakpoint
CREATE INDEX "idx_suppliers_created" ON "suppliers" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_suppliers_type_created" ON "suppliers" USING btree ("type","created_at");--> statement-breakpoint
CREATE INDEX "idx_suppliers_status_created" ON "suppliers" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "idx_suppliers_primary_facility_created" ON "suppliers" USING btree ("primary_facility_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_bipd_product" ON "booking_item_product_details" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_bipd_option" ON "booking_item_product_details" USING btree ("option_id");--> statement-breakpoint
CREATE INDEX "idx_bipd_unit" ON "booking_item_product_details" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "idx_bipd_supplier_service" ON "booking_item_product_details" USING btree ("supplier_service_id");--> statement-breakpoint
CREATE INDEX "idx_bpd_product" ON "booking_product_details" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_bpd_option" ON "booking_product_details" USING btree ("option_id");--> statement-breakpoint
CREATE INDEX "products_sourced_content_locale_fresh_idx" ON "products_sourced_content" USING btree ("locale","fresh_until");--> statement-breakpoint
CREATE INDEX "products_sourced_content_returned_locale_idx" ON "products_sourced_content" USING btree ("entity_id","returned_locale");--> statement-breakpoint
CREATE INDEX "products_sourced_content_schema_version_idx" ON "products_sourced_content" USING btree ("content_schema_version");--> statement-breakpoint
CREATE INDEX "extras_sourced_content_locale_fresh_idx" ON "extras_sourced_content" USING btree ("locale","fresh_until");--> statement-breakpoint
CREATE INDEX "extras_sourced_content_returned_locale_idx" ON "extras_sourced_content" USING btree ("entity_id","returned_locale");--> statement-breakpoint
CREATE INDEX "extras_sourced_content_schema_version_idx" ON "extras_sourced_content" USING btree ("content_schema_version");--> statement-breakpoint
CREATE INDEX "idx_option_extra_configs_sort_default" ON "option_extra_configs" USING btree ("sort_order","is_default");--> statement-breakpoint
CREATE INDEX "idx_option_extra_configs_option_sort_default" ON "option_extra_configs" USING btree ("option_id","sort_order","is_default");--> statement-breakpoint
CREATE INDEX "idx_option_extra_configs_extra_sort_default" ON "option_extra_configs" USING btree ("product_extra_id","sort_order","is_default");--> statement-breakpoint
CREATE INDEX "idx_option_extra_configs_active_sort_default" ON "option_extra_configs" USING btree ("active","sort_order","is_default");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_option_extra_configs_option_extra" ON "option_extra_configs" USING btree ("option_id","product_extra_id");--> statement-breakpoint
CREATE INDEX "idx_product_extras_sort_name" ON "product_extras" USING btree ("sort_order","name");--> statement-breakpoint
CREATE INDEX "idx_product_extras_product_sort_name" ON "product_extras" USING btree ("product_id","sort_order","name");--> statement-breakpoint
CREATE INDEX "idx_product_extras_supplier_sort_name" ON "product_extras" USING btree ("supplier_id","sort_order","name");--> statement-breakpoint
CREATE INDEX "idx_product_extras_active_sort_name" ON "product_extras" USING btree ("active","sort_order","name");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_product_extras_product_code" ON "product_extras" USING btree ("product_id","code");--> statement-breakpoint
CREATE INDEX "idx_option_units_option" ON "option_units" USING btree ("option_id");--> statement-breakpoint
CREATE INDEX "idx_option_units_option_sort" ON "option_units" USING btree ("option_id","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_option_units_type" ON "option_units" USING btree ("unit_type");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_option_units_option_code" ON "option_units" USING btree ("option_id","code");--> statement-breakpoint
CREATE INDEX "idx_product_options_product" ON "product_options" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_product_options_product_sort" ON "product_options" USING btree ("product_id","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_product_options_status" ON "product_options" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_product_options_default" ON "product_options" USING btree ("is_default");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_product_options_product_code" ON "product_options" USING btree ("product_id","code");--> statement-breakpoint
CREATE INDEX "idx_pax_tiers_product" ON "product_pax_pricing_tiers" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_pax_tiers_unit" ON "product_pax_pricing_tiers" USING btree ("option_unit_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_pax_tiers_unit_pax" ON "product_pax_pricing_tiers" USING btree ("option_unit_id","tier_pax");--> statement-breakpoint
CREATE INDEX "idx_products_status" ON "products" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_products_facility" ON "products" USING btree ("facility_id");--> statement-breakpoint
CREATE INDEX "idx_products_supplier" ON "products" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "idx_products_product_type" ON "products" USING btree ("product_type_id");--> statement-breakpoint
CREATE INDEX "idx_products_contract_template" ON "products" USING btree ("contract_template_id");--> statement-breakpoint
CREATE INDEX "idx_products_status_created" ON "products" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "idx_products_booking_mode_created" ON "products" USING btree ("booking_mode","created_at");--> statement-breakpoint
CREATE INDEX "idx_products_capacity_mode_created" ON "products" USING btree ("capacity_mode","created_at");--> statement-breakpoint
CREATE INDEX "idx_products_visibility_created" ON "products" USING btree ("visibility","created_at");--> statement-breakpoint
CREATE INDEX "idx_products_activated_created" ON "products" USING btree ("activated","created_at");--> statement-breakpoint
CREATE INDEX "idx_products_facility_created" ON "products" USING btree ("facility_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_products_supplier_created" ON "products" USING btree ("supplier_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_products_product_type_created" ON "products" USING btree ("product_type_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_products_public_created" ON "products" USING btree ("status","activated","visibility","created_at");--> statement-breakpoint
CREATE INDEX "idx_products_name_trgm" ON "products" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_products_description_trgm" ON "products" USING gin ("description" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_product_day_services_day" ON "product_day_services" USING btree ("day_id");--> statement-breakpoint
CREATE INDEX "idx_product_day_services_day_sort" ON "product_day_services" USING btree ("day_id","sort_order");--> statement-breakpoint
CREATE INDEX "idx_product_day_services_supplier_service" ON "product_day_services" USING btree ("supplier_service_id");--> statement-breakpoint
CREATE INDEX "idx_product_day_translations_day" ON "product_day_translations" USING btree ("day_id");--> statement-breakpoint
CREATE INDEX "idx_product_day_translations_language" ON "product_day_translations" USING btree ("language_tag");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_product_day_translations_day_language" ON "product_day_translations" USING btree ("day_id","language_tag");--> statement-breakpoint
CREATE INDEX "idx_product_days_itinerary" ON "product_days" USING btree ("itinerary_id");--> statement-breakpoint
CREATE INDEX "idx_product_days_itinerary_day_number" ON "product_days" USING btree ("itinerary_id","day_number");--> statement-breakpoint
CREATE INDEX "idx_product_itineraries_product" ON "product_itineraries" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_product_itineraries_product_sort" ON "product_itineraries" USING btree ("product_id","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_product_itineraries_product_default" ON "product_itineraries" USING btree ("product_id","is_default");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_product_itineraries_default" ON "product_itineraries" USING btree ("product_id") WHERE "product_itineraries"."is_default" = true;--> statement-breakpoint
CREATE INDEX "idx_product_media_product" ON "product_media" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_product_media_day" ON "product_media" USING btree ("day_id");--> statement-breakpoint
CREATE INDEX "idx_product_media_product_day" ON "product_media" USING btree ("product_id","day_id");--> statement-breakpoint
CREATE INDEX "idx_product_media_product_cover_sort" ON "product_media" USING btree ("product_id","is_cover","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_product_media_product_day_cover_sort" ON "product_media" USING btree ("product_id","day_id","is_cover","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_product_media_product_brochure_current_version" ON "product_media" USING btree ("product_id","is_brochure","day_id","is_brochure_current","brochure_version","updated_at","created_at");--> statement-breakpoint
CREATE INDEX "idx_product_notes_product" ON "product_notes" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_product_notes_product_created" ON "product_notes" USING btree ("product_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_product_versions_product" ON "product_versions" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_product_versions_product_version" ON "product_versions" USING btree ("product_id","version_number");--> statement-breakpoint
CREATE INDEX "idx_option_unit_translations_unit" ON "option_unit_translations" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "idx_option_unit_translations_language" ON "option_unit_translations" USING btree ("language_tag");--> statement-breakpoint
CREATE INDEX "idx_option_unit_translations_unit_language_created" ON "option_unit_translations" USING btree ("unit_id","language_tag","created_at");--> statement-breakpoint
CREATE INDEX "idx_option_unit_translations_language_created" ON "option_unit_translations" USING btree ("language_tag","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_option_unit_translations_unit_language" ON "option_unit_translations" USING btree ("unit_id","language_tag");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_product_activation_settings_product" ON "product_activation_settings" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_product_activation_settings_created" ON "product_activation_settings" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_product_activation_settings_mode" ON "product_activation_settings" USING btree ("activation_mode");--> statement-breakpoint
CREATE INDEX "idx_product_activation_settings_mode_created" ON "product_activation_settings" USING btree ("activation_mode","created_at");--> statement-breakpoint
CREATE INDEX "idx_product_capabilities_product" ON "product_capabilities" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_product_capabilities_capability" ON "product_capabilities" USING btree ("capability");--> statement-breakpoint
CREATE INDEX "idx_product_capabilities_capability_created" ON "product_capabilities" USING btree ("capability","created_at");--> statement-breakpoint
CREATE INDEX "idx_product_capabilities_enabled_capability_created" ON "product_capabilities" USING btree ("enabled","capability","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_product_capabilities_product_capability" ON "product_capabilities" USING btree ("product_id","capability");--> statement-breakpoint
CREATE INDEX "idx_product_delivery_formats_product" ON "product_delivery_formats" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_product_delivery_formats_default_created" ON "product_delivery_formats" USING btree ("is_default","created_at");--> statement-breakpoint
CREATE INDEX "idx_product_delivery_formats_product_default_created" ON "product_delivery_formats" USING btree ("product_id","is_default","created_at");--> statement-breakpoint
CREATE INDEX "idx_product_delivery_formats_format_default_created" ON "product_delivery_formats" USING btree ("format","is_default","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_product_delivery_formats_product_format" ON "product_delivery_formats" USING btree ("product_id","format");--> statement-breakpoint
CREATE INDEX "idx_product_faqs_product" ON "product_faqs" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_product_faqs_sort" ON "product_faqs" USING btree ("sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_product_faqs_product_sort" ON "product_faqs" USING btree ("product_id","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_product_features_product" ON "product_features" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_product_features_sort" ON "product_features" USING btree ("sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_product_features_product_sort" ON "product_features" USING btree ("product_id","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_product_features_type" ON "product_features" USING btree ("feature_type");--> statement-breakpoint
CREATE INDEX "idx_product_features_type_sort" ON "product_features" USING btree ("feature_type","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_product_features_product_type_sort" ON "product_features" USING btree ("product_id","feature_type","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_product_locations_product" ON "product_locations" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_product_locations_sort" ON "product_locations" USING btree ("sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_product_locations_product_sort" ON "product_locations" USING btree ("product_id","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_product_locations_type" ON "product_locations" USING btree ("location_type");--> statement-breakpoint
CREATE INDEX "idx_product_locations_type_product" ON "product_locations" USING btree ("location_type","product_id");--> statement-breakpoint
CREATE INDEX "idx_product_locations_type_sort" ON "product_locations" USING btree ("location_type","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_product_locations_product_type_sort" ON "product_locations" USING btree ("product_id","location_type","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_product_locations_country_product" ON "product_locations" USING btree ("country_code","product_id");--> statement-breakpoint
CREATE INDEX "idx_product_locations_title_trgm" ON "product_locations" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_product_locations_city_trgm" ON "product_locations" USING gin ("city" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_product_option_translations_option" ON "product_option_translations" USING btree ("option_id");--> statement-breakpoint
CREATE INDEX "idx_product_option_translations_language" ON "product_option_translations" USING btree ("language_tag");--> statement-breakpoint
CREATE INDEX "idx_product_option_translations_option_language_created" ON "product_option_translations" USING btree ("option_id","language_tag","created_at");--> statement-breakpoint
CREATE INDEX "idx_product_option_translations_language_created" ON "product_option_translations" USING btree ("language_tag","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_product_option_translations_option_language" ON "product_option_translations" USING btree ("option_id","language_tag");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_product_ticket_settings_product" ON "product_ticket_settings" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_product_ticket_settings_created" ON "product_ticket_settings" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_product_ticket_settings_fulfillment_created" ON "product_ticket_settings" USING btree ("fulfillment_mode","created_at");--> statement-breakpoint
CREATE INDEX "idx_product_translations_product" ON "product_translations" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_product_translations_language" ON "product_translations" USING btree ("language_tag");--> statement-breakpoint
CREATE INDEX "idx_product_translations_product_language_created" ON "product_translations" USING btree ("product_id","language_tag","created_at");--> statement-breakpoint
CREATE INDEX "idx_product_translations_language_created" ON "product_translations" USING btree ("language_tag","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_product_translations_product_language" ON "product_translations" USING btree ("product_id","language_tag");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_product_visibility_settings_product" ON "product_visibility_settings" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_product_visibility_settings_created" ON "product_visibility_settings" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_product_visibility_settings_searchable_created" ON "product_visibility_settings" USING btree ("is_searchable","created_at");--> statement-breakpoint
CREATE INDEX "idx_product_visibility_settings_bookable_created" ON "product_visibility_settings" USING btree ("is_bookable","created_at");--> statement-breakpoint
CREATE INDEX "idx_product_visibility_settings_featured_product" ON "product_visibility_settings" USING btree ("is_featured","product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_destination_translations_locale" ON "destination_translations" USING btree ("destination_id","language_tag");--> statement-breakpoint
CREATE INDEX "idx_destination_translations_language" ON "destination_translations" USING btree ("language_tag");--> statement-breakpoint
CREATE INDEX "idx_destination_translations_destination_language_created" ON "destination_translations" USING btree ("destination_id","language_tag","created_at");--> statement-breakpoint
CREATE INDEX "idx_destination_translations_language_created" ON "destination_translations" USING btree ("language_tag","created_at");--> statement-breakpoint
CREATE INDEX "idx_destination_translations_name_trgm" ON "destination_translations" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_destination_translations_description_trgm" ON "destination_translations" USING gin ("description" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_destinations_slug" ON "destinations" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_destinations_code" ON "destinations" USING btree ("code");--> statement-breakpoint
CREATE INDEX "idx_destinations_parent" ON "destinations" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "idx_destinations_active" ON "destinations" USING btree ("active");--> statement-breakpoint
CREATE INDEX "idx_destinations_canonical_place" ON "destinations" USING btree ("canonical_place_id");--> statement-breakpoint
CREATE INDEX "idx_destinations_sort_slug" ON "destinations" USING btree ("sort_order","slug");--> statement-breakpoint
CREATE INDEX "idx_destinations_active_sort_slug" ON "destinations" USING btree ("active","sort_order","slug");--> statement-breakpoint
CREATE INDEX "idx_destinations_type_sort_slug" ON "destinations" USING btree ("destination_type","sort_order","slug");--> statement-breakpoint
CREATE INDEX "idx_destinations_parent_sort_slug" ON "destinations" USING btree ("parent_id","sort_order","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_product_categories_slug" ON "product_categories" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_product_categories_parent" ON "product_categories" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "idx_product_categories_active" ON "product_categories" USING btree ("active");--> statement-breakpoint
CREATE INDEX "idx_product_categories_sort_name" ON "product_categories" USING btree ("sort_order","name");--> statement-breakpoint
CREATE INDEX "idx_product_categories_active_sort_name" ON "product_categories" USING btree ("active","sort_order","name");--> statement-breakpoint
CREATE INDEX "idx_product_categories_parent_sort_name" ON "product_categories" USING btree ("parent_id","sort_order","name");--> statement-breakpoint
CREATE INDEX "idx_product_categories_name_trgm" ON "product_categories" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_product_categories_slug_trgm" ON "product_categories" USING gin ("slug" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_pcp_product_sort" ON "product_category_products" USING btree ("product_id","sort_order");--> statement-breakpoint
CREATE INDEX "idx_pcp_category" ON "product_category_products" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_product_category_translations_locale" ON "product_category_translations" USING btree ("category_id","language_tag");--> statement-breakpoint
CREATE INDEX "idx_product_category_translations_language" ON "product_category_translations" USING btree ("language_tag");--> statement-breakpoint
CREATE INDEX "idx_product_category_translations_category_language_created" ON "product_category_translations" USING btree ("category_id","language_tag","created_at");--> statement-breakpoint
CREATE INDEX "idx_product_category_translations_language_created" ON "product_category_translations" USING btree ("language_tag","created_at");--> statement-breakpoint
CREATE INDEX "idx_product_destinations_product_sort" ON "product_destinations" USING btree ("product_id","sort_order");--> statement-breakpoint
CREATE INDEX "idx_product_destinations_destination_sort" ON "product_destinations" USING btree ("destination_id","sort_order");--> statement-breakpoint
CREATE INDEX "idx_ptp_tag" ON "product_tag_products" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_product_tag_translations_locale" ON "product_tag_translations" USING btree ("tag_id","language_tag");--> statement-breakpoint
CREATE INDEX "idx_product_tag_translations_language" ON "product_tag_translations" USING btree ("language_tag");--> statement-breakpoint
CREATE INDEX "idx_product_tag_translations_tag_language_created" ON "product_tag_translations" USING btree ("tag_id","language_tag","created_at");--> statement-breakpoint
CREATE INDEX "idx_product_tag_translations_language_created" ON "product_tag_translations" USING btree ("language_tag","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_product_tags_name" ON "product_tags" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_product_tags_name_trgm" ON "product_tags" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_product_types_code" ON "product_types" USING btree ("code");--> statement-breakpoint
CREATE INDEX "idx_product_types_active" ON "product_types" USING btree ("active");--> statement-breakpoint
CREATE INDEX "idx_product_types_sort_name" ON "product_types" USING btree ("sort_order","name");--> statement-breakpoint
CREATE INDEX "idx_product_types_active_sort_name" ON "product_types" USING btree ("active","sort_order","name");--> statement-breakpoint
CREATE INDEX "idx_exchange_rates_rate_set_created" ON "exchange_rates" USING btree ("fx_rate_set_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_exchange_rates_base_currency_created" ON "exchange_rates" USING btree ("base_currency","created_at");--> statement-breakpoint
CREATE INDEX "idx_exchange_rates_quote_currency_created" ON "exchange_rates" USING btree ("quote_currency","created_at");--> statement-breakpoint
CREATE INDEX "idx_exchange_rates_pair" ON "exchange_rates" USING btree ("base_currency","quote_currency");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_exchange_rates_set_pair" ON "exchange_rates" USING btree ("fx_rate_set_id","base_currency","quote_currency");--> statement-breakpoint
CREATE INDEX "idx_fx_rate_sets_base_currency_effective" ON "fx_rate_sets" USING btree ("base_currency","effective_at");--> statement-breakpoint
CREATE INDEX "idx_fx_rate_sets_effective_at" ON "fx_rate_sets" USING btree ("effective_at");--> statement-breakpoint
CREATE INDEX "idx_fx_rate_sets_source_effective" ON "fx_rate_sets" USING btree ("source","effective_at");--> statement-breakpoint
CREATE INDEX "idx_market_channel_rules_market_created" ON "market_channel_rules" USING btree ("market_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_market_channel_rules_channel_created" ON "market_channel_rules" USING btree ("channel_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_market_channel_rules_catalog" ON "market_channel_rules" USING btree ("price_catalog_id");--> statement-breakpoint
CREATE INDEX "idx_market_channel_rules_sellability_created" ON "market_channel_rules" USING btree ("sellability","created_at");--> statement-breakpoint
CREATE INDEX "idx_market_channel_rules_active_created" ON "market_channel_rules" USING btree ("active","created_at");--> statement-breakpoint
CREATE INDEX "idx_market_currencies_sort_created" ON "market_currencies" USING btree ("sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_market_currencies_market_sort_created" ON "market_currencies" USING btree ("market_id","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_market_currencies_code_sort_created" ON "market_currencies" USING btree ("currency_code","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_market_currencies_active_sort_created" ON "market_currencies" USING btree ("active","sort_order","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_market_currencies_market_code" ON "market_currencies" USING btree ("market_id","currency_code");--> statement-breakpoint
CREATE INDEX "idx_market_locales_sort_created" ON "market_locales" USING btree ("sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_market_locales_market_sort_created" ON "market_locales" USING btree ("market_id","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_market_locales_language_sort_created" ON "market_locales" USING btree ("language_tag","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_market_locales_active_sort_created" ON "market_locales" USING btree ("active","sort_order","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_market_locales_market_language" ON "market_locales" USING btree ("market_id","language_tag");--> statement-breakpoint
CREATE INDEX "idx_market_price_catalogs_market_created" ON "market_price_catalogs" USING btree ("market_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_market_price_catalogs_catalog_created" ON "market_price_catalogs" USING btree ("price_catalog_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_market_price_catalogs_active_created" ON "market_price_catalogs" USING btree ("active","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_market_price_catalogs_market_catalog" ON "market_price_catalogs" USING btree ("market_id","price_catalog_id");--> statement-breakpoint
CREATE INDEX "idx_market_product_rules_market_created" ON "market_product_rules" USING btree ("market_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_market_product_rules_product_created" ON "market_product_rules" USING btree ("product_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_market_product_rules_option_created" ON "market_product_rules" USING btree ("option_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_market_product_rules_catalog" ON "market_product_rules" USING btree ("price_catalog_id");--> statement-breakpoint
CREATE INDEX "idx_market_product_rules_sellability_created" ON "market_product_rules" USING btree ("sellability","created_at");--> statement-breakpoint
CREATE INDEX "idx_market_product_rules_active_created" ON "market_product_rules" USING btree ("active","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_markets_code" ON "markets" USING btree ("code");--> statement-breakpoint
CREATE INDEX "idx_markets_updated" ON "markets" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "idx_markets_status_updated" ON "markets" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "idx_markets_country_updated" ON "markets" USING btree ("country_code","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_price_catalogs_code" ON "price_catalogs" USING btree ("code");--> statement-breakpoint
CREATE INDEX "idx_price_catalogs_name" ON "price_catalogs" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_price_catalogs_currency_name" ON "price_catalogs" USING btree ("currency_code","name");--> statement-breakpoint
CREATE INDEX "idx_price_catalogs_type_name" ON "price_catalogs" USING btree ("catalog_type","name");--> statement-breakpoint
CREATE INDEX "idx_price_catalogs_active_name" ON "price_catalogs" USING btree ("active","name");--> statement-breakpoint
CREATE INDEX "idx_price_schedules_priority_name" ON "price_schedules" USING btree ("priority","name");--> statement-breakpoint
CREATE INDEX "idx_price_schedules_catalog_priority_name" ON "price_schedules" USING btree ("price_catalog_id","priority","name");--> statement-breakpoint
CREATE INDEX "idx_price_schedules_active_priority_name" ON "price_schedules" USING btree ("active","priority","name");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_price_schedules_catalog_code" ON "price_schedules" USING btree ("price_catalog_id","code");--> statement-breakpoint
CREATE INDEX "idx_pricing_categories_sort_name" ON "pricing_categories" USING btree ("sort_order","name");--> statement-breakpoint
CREATE INDEX "idx_pricing_categories_product_sort_name" ON "pricing_categories" USING btree ("product_id","sort_order","name");--> statement-breakpoint
CREATE INDEX "idx_pricing_categories_option_sort_name" ON "pricing_categories" USING btree ("option_id","sort_order","name");--> statement-breakpoint
CREATE INDEX "idx_pricing_categories_unit_sort_name" ON "pricing_categories" USING btree ("unit_id","sort_order","name");--> statement-breakpoint
CREATE INDEX "idx_pricing_categories_type_sort_name" ON "pricing_categories" USING btree ("category_type","sort_order","name");--> statement-breakpoint
CREATE INDEX "idx_pricing_categories_active_sort_name" ON "pricing_categories" USING btree ("active","sort_order","name");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_pricing_categories_option_code" ON "pricing_categories" USING btree ("option_id","code");--> statement-breakpoint
CREATE INDEX "idx_pricing_category_dependencies_created" ON "pricing_category_dependencies" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_pricing_category_dependencies_category_created" ON "pricing_category_dependencies" USING btree ("pricing_category_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_pricing_category_dependencies_master_created" ON "pricing_category_dependencies" USING btree ("master_pricing_category_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_pricing_category_dependencies_type_created" ON "pricing_category_dependencies" USING btree ("dependency_type","created_at");--> statement-breakpoint
CREATE INDEX "idx_pricing_category_dependencies_active_created" ON "pricing_category_dependencies" USING btree ("active","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_pricing_category_dependencies_pair_type" ON "pricing_category_dependencies" USING btree ("pricing_category_id","master_pricing_category_id","dependency_type");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_departure_price_overrides_target" ON "departure_price_overrides" USING btree ("departure_id","option_unit_id","price_catalog_id");--> statement-breakpoint
CREATE INDEX "idx_departure_price_overrides_departure" ON "departure_price_overrides" USING btree ("departure_id","active");--> statement-breakpoint
CREATE INDEX "idx_departure_price_overrides_option" ON "departure_price_overrides" USING btree ("option_id","active");--> statement-breakpoint
CREATE INDEX "idx_departure_price_overrides_catalog" ON "departure_price_overrides" USING btree ("price_catalog_id","active");--> statement-breakpoint
CREATE INDEX "idx_dropoff_price_rules_rule_sort_created" ON "dropoff_price_rules" USING btree ("option_price_rule_id","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_dropoff_price_rules_option_sort_created" ON "dropoff_price_rules" USING btree ("option_id","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_dropoff_price_rules_facility_sort_created" ON "dropoff_price_rules" USING btree ("facility_id","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_dropoff_price_rules_active_sort_created" ON "dropoff_price_rules" USING btree ("active","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_extra_price_rules_rule_sort_created" ON "extra_price_rules" USING btree ("option_price_rule_id","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_extra_price_rules_option_sort_created" ON "extra_price_rules" USING btree ("option_id","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_extra_price_rules_product_extra_sort_created" ON "extra_price_rules" USING btree ("product_extra_id","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_extra_price_rules_option_extra_config_sort_created" ON "extra_price_rules" USING btree ("option_extra_config_id","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_extra_price_rules_active_sort_created" ON "extra_price_rules" USING btree ("active","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_option_price_rules_updated" ON "option_price_rules" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "idx_option_price_rules_product_updated" ON "option_price_rules" USING btree ("product_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_option_price_rules_option_updated" ON "option_price_rules" USING btree ("option_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_option_price_rules_catalog_updated" ON "option_price_rules" USING btree ("price_catalog_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_option_price_rules_schedule_updated" ON "option_price_rules" USING btree ("price_schedule_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_option_price_rules_policy_updated" ON "option_price_rules" USING btree ("cancellation_policy_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_option_price_rules_pricing_mode_updated" ON "option_price_rules" USING btree ("pricing_mode","updated_at");--> statement-breakpoint
CREATE INDEX "idx_option_price_rules_active_updated" ON "option_price_rules" USING btree ("active","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_option_price_rules_option_code" ON "option_price_rules" USING btree ("option_id","code");--> statement-breakpoint
CREATE INDEX "idx_option_start_time_rules_created" ON "option_start_time_rules" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_option_start_time_rules_rule_created" ON "option_start_time_rules" USING btree ("option_price_rule_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_option_start_time_rules_option_created" ON "option_start_time_rules" USING btree ("option_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_option_start_time_rules_start_time_created" ON "option_start_time_rules" USING btree ("start_time_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_option_start_time_rules_active_created" ON "option_start_time_rules" USING btree ("active","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_option_start_time_rules_rule_start_time" ON "option_start_time_rules" USING btree ("option_price_rule_id","start_time_id");--> statement-breakpoint
CREATE INDEX "idx_option_unit_price_rules_rule_sort_created" ON "option_unit_price_rules" USING btree ("option_price_rule_id","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_option_unit_price_rules_option_sort_created" ON "option_unit_price_rules" USING btree ("option_id","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_option_unit_price_rules_unit_sort_created" ON "option_unit_price_rules" USING btree ("unit_id","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_option_unit_price_rules_category_sort_created" ON "option_unit_price_rules" USING btree ("pricing_category_id","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_option_unit_price_rules_active_sort_created" ON "option_unit_price_rules" USING btree ("active","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_option_unit_tiers_rule_sort_min_quantity" ON "option_unit_tiers" USING btree ("option_unit_price_rule_id","sort_order","min_quantity");--> statement-breakpoint
CREATE INDEX "idx_option_unit_tiers_active_sort_min_quantity" ON "option_unit_tiers" USING btree ("active","sort_order","min_quantity");--> statement-breakpoint
CREATE INDEX "idx_pickup_price_rules_rule_sort_created" ON "pickup_price_rules" USING btree ("option_price_rule_id","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_pickup_price_rules_option_sort_created" ON "pickup_price_rules" USING btree ("option_id","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_pickup_price_rules_pickup_sort_created" ON "pickup_price_rules" USING btree ("pickup_point_id","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_pickup_price_rules_active_sort_created" ON "pickup_price_rules" USING btree ("active","sort_order","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_pickup_price_rules_rule_pickup" ON "pickup_price_rules" USING btree ("option_price_rule_id","pickup_point_id");--> statement-breakpoint
CREATE INDEX "idx_cancellation_policies_updated" ON "cancellation_policies" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "idx_cancellation_policies_type_updated" ON "cancellation_policies" USING btree ("policy_type","updated_at");--> statement-breakpoint
CREATE INDEX "idx_cancellation_policies_active_updated" ON "cancellation_policies" USING btree ("active","updated_at");--> statement-breakpoint
CREATE INDEX "idx_cancellation_policies_default_updated" ON "cancellation_policies" USING btree ("is_default","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_cancellation_policies_code" ON "cancellation_policies" USING btree ("code");--> statement-breakpoint
CREATE INDEX "idx_cancellation_policy_rules_created" ON "cancellation_policy_rules" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_cancellation_policy_rules_policy_sort_created" ON "cancellation_policy_rules" USING btree ("cancellation_policy_id","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_cancellation_policy_rules_active_sort_created" ON "cancellation_policy_rules" USING btree ("active","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_pop_product" ON "promotional_offer_products" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_por_offer" ON "promotional_offer_redemptions" USING btree ("offer_id");--> statement-breakpoint
CREATE INDEX "idx_por_booking" ON "promotional_offer_redemptions" USING btree ("booking_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_por_offer_booking" ON "promotional_offer_redemptions" USING btree ("offer_id","booking_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_pofs_singleton" ON "promotional_offer_scheduler_state" USING btree ("singleton_key");--> statement-breakpoint
CREATE INDEX "idx_promotional_offers_active_validity" ON "promotional_offers" USING btree ("active","valid_from","valid_until");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_promotional_offers_slug_active" ON "promotional_offers" USING btree ("slug") WHERE active = true;--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_promotional_offers_code_active" ON "promotional_offers" USING btree (lower(code)) WHERE code is not null and active = true;--> statement-breakpoint
CREATE INDEX "idx_offer_expiration_events_offer_expires" ON "offer_expiration_events" USING btree ("offer_id","expires_at");--> statement-breakpoint
CREATE INDEX "idx_offer_expiration_events_snapshot_expires" ON "offer_expiration_events" USING btree ("snapshot_id","expires_at");--> statement-breakpoint
CREATE INDEX "idx_offer_expiration_events_status_expires" ON "offer_expiration_events" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "idx_offer_refresh_runs_offer_started" ON "offer_refresh_runs" USING btree ("offer_id","started_at");--> statement-breakpoint
CREATE INDEX "idx_offer_refresh_runs_snapshot_started" ON "offer_refresh_runs" USING btree ("snapshot_id","started_at");--> statement-breakpoint
CREATE INDEX "idx_offer_refresh_runs_status_started" ON "offer_refresh_runs" USING btree ("status","started_at");--> statement-breakpoint
CREATE INDEX "idx_sellability_explanations_snapshot_created" ON "sellability_explanations" USING btree ("snapshot_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_sellability_explanations_snapshot_item_created" ON "sellability_explanations" USING btree ("snapshot_item_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_sellability_explanations_type_created" ON "sellability_explanations" USING btree ("explanation_type","created_at");--> statement-breakpoint
CREATE INDEX "idx_sellability_policies_priority_name" ON "sellability_policies" USING btree ("priority","name");--> statement-breakpoint
CREATE INDEX "idx_sellability_policies_scope_priority_name" ON "sellability_policies" USING btree ("scope","priority","name");--> statement-breakpoint
CREATE INDEX "idx_sellability_policies_type_priority_name" ON "sellability_policies" USING btree ("policy_type","priority","name");--> statement-breakpoint
CREATE INDEX "idx_sellability_policies_product_priority_name" ON "sellability_policies" USING btree ("product_id","priority","name");--> statement-breakpoint
CREATE INDEX "idx_sellability_policies_option_priority_name" ON "sellability_policies" USING btree ("option_id","priority","name");--> statement-breakpoint
CREATE INDEX "idx_sellability_policies_market_priority_name" ON "sellability_policies" USING btree ("market_id","priority","name");--> statement-breakpoint
CREATE INDEX "idx_sellability_policies_channel_priority_name" ON "sellability_policies" USING btree ("channel_id","priority","name");--> statement-breakpoint
CREATE INDEX "idx_sellability_policies_active_priority_name" ON "sellability_policies" USING btree ("active","priority","name");--> statement-breakpoint
CREATE INDEX "idx_sellability_policy_results_snapshot_created" ON "sellability_policy_results" USING btree ("snapshot_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_sellability_policy_results_snapshot_item_created" ON "sellability_policy_results" USING btree ("snapshot_item_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_sellability_policy_results_policy_created" ON "sellability_policy_results" USING btree ("policy_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_sellability_policy_results_status_created" ON "sellability_policy_results" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "idx_sellability_snapshot_items_snapshot_order" ON "sellability_snapshot_items" USING btree ("snapshot_id","candidate_index","component_index");--> statement-breakpoint
CREATE INDEX "idx_sellability_snapshot_items_product_order" ON "sellability_snapshot_items" USING btree ("product_id","candidate_index","component_index");--> statement-breakpoint
CREATE INDEX "idx_sellability_snapshot_items_option_order" ON "sellability_snapshot_items" USING btree ("option_id","candidate_index","component_index");--> statement-breakpoint
CREATE INDEX "idx_sellability_snapshot_items_slot_order" ON "sellability_snapshot_items" USING btree ("slot_id","candidate_index","component_index");--> statement-breakpoint
CREATE INDEX "idx_sellability_snapshot_items_unit_order" ON "sellability_snapshot_items" USING btree ("unit_id","candidate_index","component_index");--> statement-breakpoint
CREATE INDEX "idx_sellability_snapshot_items_candidate" ON "sellability_snapshot_items" USING btree ("candidate_index");--> statement-breakpoint
CREATE INDEX "idx_sellability_snapshot_items_component" ON "sellability_snapshot_items" USING btree ("component_kind");--> statement-breakpoint
CREATE INDEX "idx_sellability_snapshots_updated" ON "sellability_snapshots" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "idx_sellability_snapshots_offer_updated" ON "sellability_snapshots" USING btree ("offer_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_sellability_snapshots_market_updated" ON "sellability_snapshots" USING btree ("market_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_sellability_snapshots_channel_updated" ON "sellability_snapshots" USING btree ("channel_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_sellability_snapshots_product_updated" ON "sellability_snapshots" USING btree ("product_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_sellability_snapshots_option_updated" ON "sellability_snapshots" USING btree ("option_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_sellability_snapshots_slot_updated" ON "sellability_snapshots" USING btree ("slot_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_sellability_snapshots_status_updated" ON "sellability_snapshots" USING btree ("status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "booking_catalog_snapshot_booking_entity_uniq" ON "booking_catalog_snapshot" USING btree ("booking_id","entity_module","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "booking_catalog_snapshot_idempotency_uniq" ON "booking_catalog_snapshot" USING btree ("idempotency_key") WHERE idempotency_key is not null;--> statement-breakpoint
CREATE INDEX "idx_booking_drafts_entity" ON "booking_drafts" USING btree ("entity_module","entity_id");--> statement-breakpoint
CREATE INDEX "idx_booking_drafts_expires" ON "booking_drafts" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_booking_drafts_created_by" ON "booking_drafts" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_booking_drafts_consumed" ON "booking_drafts" USING btree ("consumed_booking_id");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_overlay_variant_uniq" ON "catalog_overlay" USING btree ("entity_module","entity_id","field_path","locale","audience","market") WHERE "catalog_overlay"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "catalog_overlay_entity_idx" ON "catalog_overlay" USING btree ("entity_module","entity_id","deleted_at");--> statement-breakpoint
CREATE INDEX "catalog_overlay_origin_idx" ON "catalog_overlay" USING btree ("origin");--> statement-breakpoint
CREATE INDEX "idx_catalog_quotes_entity" ON "catalog_quotes" USING btree ("entity_module","entity_id");--> statement-breakpoint
CREATE INDEX "idx_catalog_quotes_expires" ON "catalog_quotes" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_catalog_quotes_source" ON "catalog_quotes" USING btree ("source_kind","source_ref");--> statement-breakpoint
CREATE INDEX "idx_catalog_quotes_consumed_booking" ON "catalog_quotes" USING btree ("consumed_booking_id");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_sourced_entries_entity_uniq" ON "catalog_sourced_entries" USING btree ("entity_module","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_sourced_entries_source_uniq" ON "catalog_sourced_entries" USING btree ("source_kind","source_connection_id","source_ref");--> statement-breakpoint
CREATE INDEX "catalog_sourced_entries_module_kind_idx" ON "catalog_sourced_entries" USING btree ("entity_module","source_kind");--> statement-breakpoint
CREATE INDEX "catalog_sourced_entries_status_seen_idx" ON "catalog_sourced_entries" USING btree ("status","last_seen_at");--> statement-breakpoint
CREATE INDEX "catalog_sourced_entries_connection_age_idx" ON "catalog_sourced_entries" USING btree ("source_kind","source_connection_id","last_sourced_at");--> statement-breakpoint
CREATE INDEX "idx_booking_extras_updated" ON "booking_extras" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "idx_booking_extras_booking_updated" ON "booking_extras" USING btree ("booking_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_booking_extras_product_extra_updated" ON "booking_extras" USING btree ("product_extra_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_booking_extras_option_extra_config_updated" ON "booking_extras" USING btree ("option_extra_config_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_booking_extras_status_updated" ON "booking_extras" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "idx_extra_participant_selections_booking_updated" ON "extra_participant_selections" USING btree ("booking_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_extra_participant_selections_traveler_updated" ON "extra_participant_selections" USING btree ("traveler_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_extra_participant_selections_extra_updated" ON "extra_participant_selections" USING btree ("product_extra_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_extra_participant_selections_status_updated" ON "extra_participant_selections" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "idx_extra_participant_selections_collection_updated" ON "extra_participant_selections" USING btree ("collection_status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_extra_participant_selection" ON "extra_participant_selections" USING btree ("booking_id","traveler_id","product_extra_id");--> statement-breakpoint
CREATE INDEX "idx_booking_answers_booking_updated" ON "booking_answers" USING btree ("booking_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_booking_answers_question_updated" ON "booking_answers" USING btree ("product_booking_question_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_booking_answers_traveler_updated" ON "booking_answers" USING btree ("booking_traveler_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_booking_answers_booking_extra_updated" ON "booking_answers" USING btree ("booking_extra_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_booking_answers_target_updated" ON "booking_answers" USING btree ("target","updated_at");--> statement-breakpoint
CREATE INDEX "idx_booking_question_extra_triggers_created" ON "booking_question_extra_triggers" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_booking_question_extra_triggers_question_created" ON "booking_question_extra_triggers" USING btree ("product_booking_question_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_booking_question_extra_triggers_product_extra_created" ON "booking_question_extra_triggers" USING btree ("product_extra_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_booking_question_extra_triggers_option_extra_config_created" ON "booking_question_extra_triggers" USING btree ("option_extra_config_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_booking_question_extra_triggers_active_created" ON "booking_question_extra_triggers" USING btree ("active","created_at");--> statement-breakpoint
CREATE INDEX "idx_booking_question_option_triggers_created" ON "booking_question_option_triggers" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_booking_question_option_triggers_question_created" ON "booking_question_option_triggers" USING btree ("product_booking_question_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_booking_question_option_triggers_option_created" ON "booking_question_option_triggers" USING btree ("option_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_booking_question_option_triggers_active_created" ON "booking_question_option_triggers" USING btree ("active","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_booking_question_option_triggers_question_option" ON "booking_question_option_triggers" USING btree ("product_booking_question_id","option_id");--> statement-breakpoint
CREATE INDEX "idx_booking_question_options_sort" ON "booking_question_options" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "idx_booking_question_options_question_sort" ON "booking_question_options" USING btree ("product_booking_question_id","sort_order");--> statement-breakpoint
CREATE INDEX "idx_booking_question_options_active_sort" ON "booking_question_options" USING btree ("active","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_booking_question_options_question_value" ON "booking_question_options" USING btree ("product_booking_question_id","value");--> statement-breakpoint
CREATE INDEX "idx_booking_question_unit_triggers_created" ON "booking_question_unit_triggers" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_booking_question_unit_triggers_question_created" ON "booking_question_unit_triggers" USING btree ("product_booking_question_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_booking_question_unit_triggers_unit_created" ON "booking_question_unit_triggers" USING btree ("unit_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_booking_question_unit_triggers_active_created" ON "booking_question_unit_triggers" USING btree ("active","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_booking_question_unit_triggers_question_unit" ON "booking_question_unit_triggers" USING btree ("product_booking_question_id","unit_id");--> statement-breakpoint
CREATE INDEX "idx_option_booking_questions_sort" ON "option_booking_questions" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "idx_option_booking_questions_option_sort" ON "option_booking_questions" USING btree ("option_id","sort_order");--> statement-breakpoint
CREATE INDEX "idx_option_booking_questions_question_sort" ON "option_booking_questions" USING btree ("product_booking_question_id","sort_order");--> statement-breakpoint
CREATE INDEX "idx_option_booking_questions_active_sort" ON "option_booking_questions" USING btree ("active","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_option_booking_questions_option_question" ON "option_booking_questions" USING btree ("option_id","product_booking_question_id");--> statement-breakpoint
CREATE INDEX "idx_product_booking_questions_sort" ON "product_booking_questions" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "idx_product_booking_questions_product_sort" ON "product_booking_questions" USING btree ("product_id","sort_order");--> statement-breakpoint
CREATE INDEX "idx_product_booking_questions_target_sort" ON "product_booking_questions" USING btree ("target","sort_order");--> statement-breakpoint
CREATE INDEX "idx_product_booking_questions_field_type_sort" ON "product_booking_questions" USING btree ("field_type","sort_order");--> statement-breakpoint
CREATE INDEX "idx_product_booking_questions_active_sort" ON "product_booking_questions" USING btree ("active","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_product_booking_questions_product_code" ON "product_booking_questions" USING btree ("product_id","code");--> statement-breakpoint
CREATE INDEX "idx_product_contact_requirements_sort" ON "product_contact_requirements" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "idx_product_contact_requirements_product_sort" ON "product_contact_requirements" USING btree ("product_id","sort_order");--> statement-breakpoint
CREATE INDEX "idx_product_contact_requirements_option_sort" ON "product_contact_requirements" USING btree ("option_id","sort_order");--> statement-breakpoint
CREATE INDEX "idx_product_contact_requirements_active_sort" ON "product_contact_requirements" USING btree ("active","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_product_contact_requirements_scope_field" ON "product_contact_requirements" USING btree ("product_id","option_id","scope","field_key");--> statement-breakpoint
CREATE INDEX "idx_bptd_lead_traveler" ON "booking_traveler_travel_details" USING btree ("is_lead_traveler");--> statement-breakpoint
CREATE INDEX "idx_bptd_sharing_group" ON "booking_traveler_travel_details" USING btree ("sharing_group_id");--> statement-breakpoint
CREATE INDEX "idx_bptd_room_type" ON "booking_traveler_travel_details" USING btree ("room_type_id");--> statement-breakpoint
CREATE INDEX "idx_booking_pii_access_log_booking" ON "booking_pii_access_log" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "idx_booking_pii_access_log_traveler" ON "booking_pii_access_log" USING btree ("traveler_id");--> statement-breakpoint
CREATE INDEX "idx_booking_pii_access_log_actor" ON "booking_pii_access_log" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "idx_booking_pii_access_log_created_at" ON "booking_pii_access_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_booking_travelers_booking" ON "booking_travelers" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "idx_booking_travelers_booking_primary_created" ON "booking_travelers" USING btree ("booking_id","is_primary","created_at");--> statement-breakpoint
CREATE INDEX "idx_booking_travelers_booking_type_created" ON "booking_travelers" USING btree ("booking_id","participant_type","created_at");--> statement-breakpoint
CREATE INDEX "idx_booking_travelers_type" ON "booking_travelers" USING btree ("participant_type");--> statement-breakpoint
CREATE INDEX "idx_booking_travelers_person" ON "booking_travelers" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "idx_bookings_status" ON "bookings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_bookings_status_created" ON "bookings" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "idx_bookings_person" ON "bookings" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "idx_bookings_organization" ON "bookings" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_bookings_source_type" ON "bookings" USING btree ("source_type");--> statement-breakpoint
CREATE INDEX "idx_bookings_number" ON "bookings" USING btree ("booking_number");--> statement-breakpoint
CREATE UNIQUE INDEX "booking_group_members_booking_unique" ON "booking_group_members" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "idx_booking_group_members_group_created" ON "booking_group_members" USING btree ("group_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_booking_groups_kind_created" ON "booking_groups" USING btree ("kind","created_at");--> statement-breakpoint
CREATE INDEX "idx_booking_groups_product_created" ON "booking_groups" USING btree ("product_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_booking_groups_option_unit_created" ON "booking_groups" USING btree ("option_unit_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_booking_allocations_booking" ON "booking_allocations" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "idx_booking_allocations_booking_created" ON "booking_allocations" USING btree ("booking_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_booking_allocations_item" ON "booking_allocations" USING btree ("booking_item_id");--> statement-breakpoint
CREATE INDEX "idx_booking_allocations_slot" ON "booking_allocations" USING btree ("availability_slot_id");--> statement-breakpoint
CREATE INDEX "idx_booking_allocations_status" ON "booking_allocations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_booking_fulfillments_booking" ON "booking_fulfillments" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "idx_booking_fulfillments_booking_created" ON "booking_fulfillments" USING btree ("booking_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_booking_fulfillments_item" ON "booking_fulfillments" USING btree ("booking_item_id");--> statement-breakpoint
CREATE INDEX "idx_booking_fulfillments_traveler" ON "booking_fulfillments" USING btree ("traveler_id");--> statement-breakpoint
CREATE INDEX "idx_booking_fulfillments_status" ON "booking_fulfillments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_booking_item_travelers_item" ON "booking_item_travelers" USING btree ("booking_item_id");--> statement-breakpoint
CREATE INDEX "idx_booking_item_travelers_item_primary_created" ON "booking_item_travelers" USING btree ("booking_item_id","is_primary","created_at");--> statement-breakpoint
CREATE INDEX "idx_booking_item_travelers_traveler" ON "booking_item_travelers" USING btree ("traveler_id");--> statement-breakpoint
CREATE INDEX "idx_booking_items_booking" ON "booking_items" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "idx_booking_items_booking_created" ON "booking_items" USING btree ("booking_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_booking_items_status" ON "booking_items" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_booking_redemption_events_booking" ON "booking_redemption_events" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "idx_booking_redemption_events_booking_redeemed_created" ON "booking_redemption_events" USING btree ("booking_id","redeemed_at","created_at");--> statement-breakpoint
CREATE INDEX "idx_booking_redemption_events_item" ON "booking_redemption_events" USING btree ("booking_item_id");--> statement-breakpoint
CREATE INDEX "idx_booking_redemption_events_traveler" ON "booking_redemption_events" USING btree ("traveler_id");--> statement-breakpoint
CREATE INDEX "idx_booking_redemption_events_redeemed_at" ON "booking_redemption_events" USING btree ("redeemed_at");--> statement-breakpoint
CREATE INDEX "idx_booking_activity_log_booking" ON "booking_activity_log" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "idx_booking_activity_log_booking_created" ON "booking_activity_log" USING btree ("booking_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_booking_documents_booking" ON "booking_documents" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "idx_booking_documents_booking_created" ON "booking_documents" USING btree ("booking_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_booking_documents_traveler" ON "booking_documents" USING btree ("traveler_id");--> statement-breakpoint
CREATE INDEX "idx_booking_notes_booking" ON "booking_notes" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "idx_booking_notes_booking_created" ON "booking_notes" USING btree ("booking_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_booking_session_states_booking" ON "booking_session_states" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "idx_booking_session_states_key" ON "booking_session_states" USING btree ("state_key");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_booking_session_states_booking_key" ON "booking_session_states" USING btree ("booking_id","state_key");--> statement-breakpoint
CREATE INDEX "idx_booking_supplier_statuses_booking" ON "booking_supplier_statuses" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "idx_booking_supplier_statuses_booking_created" ON "booking_supplier_statuses" USING btree ("booking_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_booking_supplier_statuses_service" ON "booking_supplier_statuses" USING btree ("supplier_service_id");--> statement-breakpoint
CREATE INDEX "idx_booking_supplier_statuses_supplier" ON "booking_supplier_statuses" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "idx_booking_supplier_statuses_invoice_line" ON "booking_supplier_statuses" USING btree ("supplier_invoice_line_id");--> statement-breakpoint
CREATE INDEX "idx_booking_origins_proposal_version" ON "booking_origins" USING btree ("proposal_version_id");--> statement-breakpoint
CREATE INDEX "idx_booking_origins_trip_snapshot" ON "booking_origins" USING btree ("trip_snapshot_id");--> statement-breakpoint
CREATE INDEX "idx_booking_origins_reservation_plan" ON "booking_origins" USING btree ("reservation_plan_id");--> statement-breakpoint
CREATE INDEX "idx_booking_origins_catalog_price_response" ON "booking_origins" USING btree ("catalog_price_response_id");--> statement-breakpoint
CREATE INDEX "idx_booking_origins_catalog_snapshot" ON "booking_origins" USING btree ("catalog_snapshot_id");--> statement-breakpoint
CREATE INDEX "idx_booking_origins_provider_order" ON "booking_origins" USING btree ("provider_order_ref");--> statement-breakpoint
CREATE INDEX "idx_booking_origins_legacy_offer" ON "booking_origins" USING btree ("legacy_transaction_offer_id");--> statement-breakpoint
CREATE INDEX "idx_booking_origins_legacy_order" ON "booking_origins" USING btree ("legacy_transaction_order_id");--> statement-breakpoint
CREATE INDEX "idx_booking_staff_assignments_booking" ON "booking_staff_assignments" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "idx_booking_staff_assignments_booking_role_created" ON "booking_staff_assignments" USING btree ("booking_id","role","created_at");--> statement-breakpoint
CREATE INDEX "idx_booking_staff_assignments_item" ON "booking_staff_assignments" USING btree ("booking_item_id");--> statement-breakpoint
CREATE INDEX "idx_booking_staff_assignments_person" ON "booking_staff_assignments" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "idx_booking_guarantees_booking" ON "booking_guarantees" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "idx_booking_guarantees_booking_created" ON "booking_guarantees" USING btree ("booking_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_booking_guarantees_schedule" ON "booking_guarantees" USING btree ("booking_payment_schedule_id");--> statement-breakpoint
CREATE INDEX "idx_booking_guarantees_item" ON "booking_guarantees" USING btree ("booking_item_id");--> statement-breakpoint
CREATE INDEX "idx_booking_guarantees_instrument" ON "booking_guarantees" USING btree ("payment_instrument_id");--> statement-breakpoint
CREATE INDEX "idx_booking_guarantees_authorization" ON "booking_guarantees" USING btree ("payment_authorization_id");--> statement-breakpoint
CREATE INDEX "idx_booking_guarantees_status" ON "booking_guarantees" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_booking_item_commissions_item" ON "booking_item_commissions" USING btree ("booking_item_id");--> statement-breakpoint
CREATE INDEX "idx_booking_item_commissions_item_created" ON "booking_item_commissions" USING btree ("booking_item_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_booking_item_commissions_channel" ON "booking_item_commissions" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "idx_booking_item_commissions_status" ON "booking_item_commissions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_booking_item_tax_lines_item" ON "booking_item_tax_lines" USING btree ("booking_item_id");--> statement-breakpoint
CREATE INDEX "idx_booking_item_tax_lines_item_sort_created" ON "booking_item_tax_lines" USING btree ("booking_item_id","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_booking_item_tax_lines_scope" ON "booking_item_tax_lines" USING btree ("scope");--> statement-breakpoint
CREATE INDEX "idx_booking_payment_schedules_booking" ON "booking_payment_schedules" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "idx_booking_payment_schedules_booking_due_created" ON "booking_payment_schedules" USING btree ("booking_id","due_date","created_at");--> statement-breakpoint
CREATE INDEX "idx_booking_payment_schedules_item" ON "booking_payment_schedules" USING btree ("booking_item_id");--> statement-breakpoint
CREATE INDEX "idx_booking_payment_schedules_status" ON "booking_payment_schedules" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_booking_payment_schedules_due_date" ON "booking_payment_schedules" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "idx_finance_notes_invoice" ON "finance_notes" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "idx_finance_notes_invoice_created" ON "finance_notes" USING btree ("invoice_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_invoice_attachments_invoice" ON "invoice_attachments" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "idx_invoice_attachments_invoice_created" ON "invoice_attachments" USING btree ("invoice_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_invoice_external_refs_invoice" ON "invoice_external_refs" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "idx_invoice_external_refs_invoice_created" ON "invoice_external_refs" USING btree ("invoice_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_invoice_external_refs_provider" ON "invoice_external_refs" USING btree ("provider");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_invoice_external_refs_invoice_provider" ON "invoice_external_refs" USING btree ("invoice_id","provider");--> statement-breakpoint
CREATE INDEX "idx_invoice_number_series_scope" ON "invoice_number_series" USING btree ("scope");--> statement-breakpoint
CREATE INDEX "idx_invoice_number_series_active" ON "invoice_number_series" USING btree ("active");--> statement-breakpoint
CREATE INDEX "idx_invoice_number_series_scope_default" ON "invoice_number_series" USING btree ("scope","is_default");--> statement-breakpoint
CREATE INDEX "idx_invoice_number_series_external_provider" ON "invoice_number_series" USING btree ("external_provider");--> statement-breakpoint
CREATE INDEX "idx_invoice_number_series_scope_updated" ON "invoice_number_series" USING btree ("scope","updated_at");--> statement-breakpoint
CREATE INDEX "idx_invoice_number_series_active_updated" ON "invoice_number_series" USING btree ("active","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_invoice_number_series_default_scope_active" ON "invoice_number_series" USING btree ("scope") WHERE "invoice_number_series"."active" = true AND "invoice_number_series"."is_default" = true;--> statement-breakpoint
CREATE INDEX "idx_invoice_renditions_invoice" ON "invoice_renditions" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "idx_invoice_renditions_invoice_created" ON "invoice_renditions" USING btree ("invoice_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_invoice_renditions_template" ON "invoice_renditions" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "idx_invoice_renditions_status" ON "invoice_renditions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_invoice_renditions_format" ON "invoice_renditions" USING btree ("format");--> statement-breakpoint
CREATE INDEX "idx_invoice_templates_language" ON "invoice_templates" USING btree ("language");--> statement-breakpoint
CREATE INDEX "idx_invoice_templates_language_updated" ON "invoice_templates" USING btree ("language","updated_at");--> statement-breakpoint
CREATE INDEX "idx_invoice_templates_jurisdiction" ON "invoice_templates" USING btree ("jurisdiction");--> statement-breakpoint
CREATE INDEX "idx_invoice_templates_jurisdiction_updated" ON "invoice_templates" USING btree ("jurisdiction","updated_at");--> statement-breakpoint
CREATE INDEX "idx_invoice_templates_default" ON "invoice_templates" USING btree ("is_default");--> statement-breakpoint
CREATE INDEX "idx_invoice_templates_default_updated" ON "invoice_templates" USING btree ("is_default","updated_at");--> statement-breakpoint
CREATE INDEX "idx_invoice_templates_active" ON "invoice_templates" USING btree ("active");--> statement-breakpoint
CREATE INDEX "idx_invoice_templates_active_updated" ON "invoice_templates" USING btree ("active","updated_at");--> statement-breakpoint
CREATE INDEX "idx_payment_instruments_owner_type" ON "payment_instruments" USING btree ("owner_type");--> statement-breakpoint
CREATE INDEX "idx_payment_instruments_owner_type_updated" ON "payment_instruments" USING btree ("owner_type","updated_at");--> statement-breakpoint
CREATE INDEX "idx_payment_instruments_person" ON "payment_instruments" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "idx_payment_instruments_person_updated" ON "payment_instruments" USING btree ("person_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_payment_instruments_organization" ON "payment_instruments" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_payment_instruments_organization_updated" ON "payment_instruments" USING btree ("organization_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_payment_instruments_supplier" ON "payment_instruments" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "idx_payment_instruments_supplier_updated" ON "payment_instruments" USING btree ("supplier_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_payment_instruments_channel" ON "payment_instruments" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "idx_payment_instruments_channel_updated" ON "payment_instruments" USING btree ("channel_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_payment_instruments_status" ON "payment_instruments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_payment_instruments_status_updated" ON "payment_instruments" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "idx_payment_instruments_type" ON "payment_instruments" USING btree ("instrument_type");--> statement-breakpoint
CREATE INDEX "idx_payment_instruments_type_updated" ON "payment_instruments" USING btree ("instrument_type","updated_at");--> statement-breakpoint
CREATE INDEX "idx_payment_authorizations_booking" ON "payment_authorizations" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "idx_payment_authorizations_booking_created" ON "payment_authorizations" USING btree ("booking_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_payment_authorizations_order" ON "payment_authorizations" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_payment_authorizations_order_created" ON "payment_authorizations" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_payment_authorizations_invoice" ON "payment_authorizations" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "idx_payment_authorizations_invoice_created" ON "payment_authorizations" USING btree ("invoice_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_payment_authorizations_guarantee" ON "payment_authorizations" USING btree ("booking_guarantee_id");--> statement-breakpoint
CREATE INDEX "idx_payment_authorizations_guarantee_created" ON "payment_authorizations" USING btree ("booking_guarantee_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_payment_authorizations_instrument" ON "payment_authorizations" USING btree ("payment_instrument_id");--> statement-breakpoint
CREATE INDEX "idx_payment_authorizations_instrument_created" ON "payment_authorizations" USING btree ("payment_instrument_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_payment_authorizations_status" ON "payment_authorizations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_payment_authorizations_status_created" ON "payment_authorizations" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "idx_payment_captures_authorization" ON "payment_captures" USING btree ("payment_authorization_id");--> statement-breakpoint
CREATE INDEX "idx_payment_captures_authorization_created" ON "payment_captures" USING btree ("payment_authorization_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_payment_captures_invoice" ON "payment_captures" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "idx_payment_captures_invoice_created" ON "payment_captures" USING btree ("invoice_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_payment_captures_status" ON "payment_captures" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_payment_captures_status_created" ON "payment_captures" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "idx_payment_sessions_target" ON "payment_sessions" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "idx_payment_sessions_target_created" ON "payment_sessions" USING btree ("target_type","created_at");--> statement-breakpoint
CREATE INDEX "idx_payment_sessions_booking" ON "payment_sessions" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "idx_payment_sessions_booking_created" ON "payment_sessions" USING btree ("booking_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_payment_sessions_order" ON "payment_sessions" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_payment_sessions_order_created" ON "payment_sessions" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_payment_sessions_invoice" ON "payment_sessions" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "idx_payment_sessions_invoice_created" ON "payment_sessions" USING btree ("invoice_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_payment_sessions_schedule" ON "payment_sessions" USING btree ("booking_payment_schedule_id");--> statement-breakpoint
CREATE INDEX "idx_payment_sessions_schedule_created" ON "payment_sessions" USING btree ("booking_payment_schedule_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_payment_sessions_guarantee" ON "payment_sessions" USING btree ("booking_guarantee_id");--> statement-breakpoint
CREATE INDEX "idx_payment_sessions_guarantee_created" ON "payment_sessions" USING btree ("booking_guarantee_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_payment_sessions_status" ON "payment_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_payment_sessions_status_created" ON "payment_sessions" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "idx_payment_sessions_provider" ON "payment_sessions" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "idx_payment_sessions_provider_created" ON "payment_sessions" USING btree ("provider","created_at");--> statement-breakpoint
CREATE INDEX "idx_payment_sessions_provider_session" ON "payment_sessions" USING btree ("provider_session_id");--> statement-breakpoint
CREATE INDEX "idx_payment_sessions_expires_at" ON "payment_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_payment_sessions_idempotency" ON "payment_sessions" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_payment_sessions_provider_session" ON "payment_sessions" USING btree ("provider","provider_session_id");--> statement-breakpoint
CREATE INDEX "idx_credit_note_line_items_credit_note" ON "credit_note_line_items" USING btree ("credit_note_id");--> statement-breakpoint
CREATE INDEX "idx_credit_note_line_items_credit_note_sort" ON "credit_note_line_items" USING btree ("credit_note_id","sort_order");--> statement-breakpoint
CREATE INDEX "idx_credit_notes_invoice" ON "credit_notes" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "idx_credit_notes_invoice_created" ON "credit_notes" USING btree ("invoice_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_credit_notes_fx_rate_set" ON "credit_notes" USING btree ("fx_rate_set_id");--> statement-breakpoint
CREATE INDEX "idx_credit_notes_number" ON "credit_notes" USING btree ("credit_note_number");--> statement-breakpoint
CREATE INDEX "idx_invoice_line_items_invoice" ON "invoice_line_items" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "idx_invoice_line_items_invoice_sort" ON "invoice_line_items" USING btree ("invoice_id","sort_order");--> statement-breakpoint
CREATE INDEX "idx_invoice_line_items_booking_item" ON "invoice_line_items" USING btree ("booking_item_id");--> statement-breakpoint
CREATE INDEX "idx_invoice_line_items_payment_schedule" ON "invoice_line_items" USING btree ("booking_payment_schedule_id");--> statement-breakpoint
CREATE INDEX "idx_invoices_booking" ON "invoices" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "idx_invoices_booking_created" ON "invoices" USING btree ("booking_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_invoices_person" ON "invoices" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "idx_invoices_organization" ON "invoices" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_invoices_status" ON "invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_invoices_status_created" ON "invoices" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "idx_invoices_outstanding_due" ON "invoices" USING btree ("status","balance_due_cents","due_date");--> statement-breakpoint
CREATE INDEX "idx_invoices_created" ON "invoices" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_invoices_fx_rate_set" ON "invoices" USING btree ("fx_rate_set_id");--> statement-breakpoint
CREATE INDEX "idx_invoices_number" ON "invoices" USING btree ("invoice_number");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_invoice_number_type_active_idx" ON "invoices" USING btree ("invoice_number","invoice_type") WHERE "invoices"."status" <> 'void';--> statement-breakpoint
CREATE INDEX "idx_invoices_due_date" ON "invoices" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "idx_invoices_converted_from" ON "invoices" USING btree ("converted_from_invoice_id");--> statement-breakpoint
CREATE INDEX "idx_payments_invoice" ON "payments" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "idx_payments_invoice_date" ON "payments" USING btree ("invoice_id","payment_date");--> statement-breakpoint
CREATE INDEX "idx_payments_fx_rate_set" ON "payments" USING btree ("fx_rate_set_id");--> statement-breakpoint
CREATE INDEX "idx_payments_instrument" ON "payments" USING btree ("payment_instrument_id");--> statement-breakpoint
CREATE INDEX "idx_payments_authorization" ON "payments" USING btree ("payment_authorization_id");--> statement-breakpoint
CREATE INDEX "idx_payments_capture" ON "payments" USING btree ("payment_capture_id");--> statement-breakpoint
CREATE INDEX "idx_payments_status" ON "payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_payments_date" ON "payments" USING btree ("payment_date");--> statement-breakpoint
CREATE INDEX "idx_cost_categories_sort" ON "cost_categories" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "idx_supplier_cost_allocations_invoice" ON "supplier_cost_allocations" USING btree ("supplier_invoice_id");--> statement-breakpoint
CREATE INDEX "idx_supplier_cost_allocations_line" ON "supplier_cost_allocations" USING btree ("supplier_invoice_line_id");--> statement-breakpoint
CREATE INDEX "idx_supplier_cost_allocations_departure" ON "supplier_cost_allocations" USING btree ("departure_id");--> statement-breakpoint
CREATE INDEX "idx_supplier_cost_allocations_product" ON "supplier_cost_allocations" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_supplier_cost_allocations_booking" ON "supplier_cost_allocations" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "idx_supplier_invoice_attachments_invoice" ON "supplier_invoice_attachments" USING btree ("supplier_invoice_id");--> statement-breakpoint
CREATE INDEX "idx_supplier_invoice_attachments_invoice_created" ON "supplier_invoice_attachments" USING btree ("supplier_invoice_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_supplier_invoice_lines_invoice" ON "supplier_invoice_lines" USING btree ("supplier_invoice_id");--> statement-breakpoint
CREATE INDEX "idx_supplier_invoice_lines_invoice_sort" ON "supplier_invoice_lines" USING btree ("supplier_invoice_id","sort_order");--> statement-breakpoint
CREATE INDEX "idx_supplier_invoice_lines_service_type" ON "supplier_invoice_lines" USING btree ("service_type");--> statement-breakpoint
CREATE INDEX "idx_supplier_invoices_supplier" ON "supplier_invoices" USING btree ("supplier_id") WHERE "supplier_invoices"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_supplier_invoices_supplier_created" ON "supplier_invoices" USING btree ("supplier_id","created_at") WHERE "supplier_invoices"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_supplier_invoices_status" ON "supplier_invoices" USING btree ("status") WHERE "supplier_invoices"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_supplier_invoices_status_created" ON "supplier_invoices" USING btree ("status","created_at") WHERE "supplier_invoices"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_supplier_invoices_due_date" ON "supplier_invoices" USING btree ("due_date") WHERE "supplier_invoices"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_supplier_invoices_fx_rate_set" ON "supplier_invoices" USING btree ("fx_rate_set_id");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_invoices_supplier_number_active_idx" ON "supplier_invoices" USING btree ("supplier_id","supplier_invoice_no") WHERE "supplier_invoices"."status" <> 'void' AND "supplier_invoices"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_supplier_payments_booking" ON "supplier_payments" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "idx_supplier_payments_booking_created" ON "supplier_payments" USING btree ("booking_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_supplier_payments_supplier" ON "supplier_payments" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "idx_supplier_payments_supplier_created" ON "supplier_payments" USING btree ("supplier_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_supplier_payments_fx_rate_set" ON "supplier_payments" USING btree ("fx_rate_set_id");--> statement-breakpoint
CREATE INDEX "idx_supplier_payments_instrument" ON "supplier_payments" USING btree ("payment_instrument_id");--> statement-breakpoint
CREATE INDEX "idx_supplier_payments_status" ON "supplier_payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_supplier_payments_status_created" ON "supplier_payments" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "idx_supplier_payments_date" ON "supplier_payments" USING btree ("payment_date");--> statement-breakpoint
CREATE INDEX "idx_supplier_payments_supplier_invoice" ON "supplier_payments" USING btree ("supplier_invoice_id");--> statement-breakpoint
CREATE INDEX "idx_tax_classes_code" ON "tax_classes" USING btree ("code");--> statement-breakpoint
CREATE INDEX "idx_tax_classes_active" ON "tax_classes" USING btree ("active");--> statement-breakpoint
CREATE INDEX "idx_tax_policy_profiles_code" ON "tax_policy_profiles" USING btree ("code");--> statement-breakpoint
CREATE INDEX "idx_tax_policy_profiles_active" ON "tax_policy_profiles" USING btree ("active");--> statement-breakpoint
CREATE INDEX "idx_tax_policy_rules_profile" ON "tax_policy_rules" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "idx_tax_policy_rules_profile_side_priority" ON "tax_policy_rules" USING btree ("profile_id","side","priority");--> statement-breakpoint
CREATE INDEX "idx_tax_policy_rules_active" ON "tax_policy_rules" USING btree ("active");--> statement-breakpoint
CREATE INDEX "idx_tax_regimes_code" ON "tax_regimes" USING btree ("code");--> statement-breakpoint
CREATE INDEX "idx_tax_regimes_code_updated" ON "tax_regimes" USING btree ("code","updated_at");--> statement-breakpoint
CREATE INDEX "idx_tax_regimes_jurisdiction" ON "tax_regimes" USING btree ("jurisdiction");--> statement-breakpoint
CREATE INDEX "idx_tax_regimes_jurisdiction_updated" ON "tax_regimes" USING btree ("jurisdiction","updated_at");--> statement-breakpoint
CREATE INDEX "idx_tax_regimes_active" ON "tax_regimes" USING btree ("active");--> statement-breakpoint
CREATE INDEX "idx_tax_regimes_active_updated" ON "tax_regimes" USING btree ("active","updated_at");--> statement-breakpoint
CREATE INDEX "idx_voucher_redemptions_voucher" ON "voucher_redemptions" USING btree ("voucher_id");--> statement-breakpoint
CREATE INDEX "idx_voucher_redemptions_booking" ON "voucher_redemptions" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "idx_voucher_redemptions_voucher_created" ON "voucher_redemptions" USING btree ("voucher_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_vouchers_code" ON "vouchers" USING btree ("code");--> statement-breakpoint
CREATE INDEX "idx_vouchers_series" ON "vouchers" USING btree ("series_code");--> statement-breakpoint
CREATE INDEX "idx_vouchers_status" ON "vouchers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_vouchers_person" ON "vouchers" USING btree ("issued_to_person_id");--> statement-breakpoint
CREATE INDEX "idx_vouchers_organization" ON "vouchers" USING btree ("issued_to_organization_id");--> statement-breakpoint
CREATE INDEX "idx_vouchers_source_booking" ON "vouchers" USING btree ("source_booking_id");--> statement-breakpoint
CREATE INDEX "idx_vouchers_valid_from" ON "vouchers" USING btree ("valid_from");--> statement-breakpoint
CREATE INDEX "idx_vouchers_expires_at" ON "vouchers" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_vouchers_remaining" ON "vouchers" USING btree ("remaining_amount_cents");--> statement-breakpoint
CREATE INDEX "idx_allocation_audit_slot_created" ON "allocation_audit_log" USING btree ("slot_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_allocation_audit_traveler" ON "allocation_audit_log" USING btree ("traveler_id");--> statement-breakpoint
CREATE INDEX "idx_allocation_resources_slot_kind" ON "allocation_resources" USING btree ("slot_id","kind");--> statement-breakpoint
CREATE INDEX "idx_allocation_resources_parent" ON "allocation_resources" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "idx_allocation_resources_kind_sort" ON "allocation_resources" USING btree ("kind","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_availability_closeouts_product_created" ON "availability_closeouts" USING btree ("product_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_availability_closeouts_slot_created" ON "availability_closeouts" USING btree ("slot_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_availability_closeouts_date_created" ON "availability_closeouts" USING btree ("date_local","created_at");--> statement-breakpoint
CREATE INDEX "idx_availability_rules_updated" ON "availability_rules" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "idx_availability_rules_product_updated" ON "availability_rules" USING btree ("product_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_availability_rules_option_updated" ON "availability_rules" USING btree ("option_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_availability_rules_facility_updated" ON "availability_rules" USING btree ("facility_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_availability_rules_active_updated" ON "availability_rules" USING btree ("active","updated_at");--> statement-breakpoint
CREATE INDEX "idx_availability_slots_product_starts_at" ON "availability_slots" USING btree ("product_id","starts_at");--> statement-breakpoint
CREATE INDEX "idx_availability_slots_itinerary_starts_at" ON "availability_slots" USING btree ("itinerary_id","starts_at");--> statement-breakpoint
CREATE INDEX "idx_availability_slots_option_starts_at" ON "availability_slots" USING btree ("option_id","starts_at");--> statement-breakpoint
CREATE INDEX "idx_availability_slots_facility_starts_at" ON "availability_slots" USING btree ("facility_id","starts_at");--> statement-breakpoint
CREATE INDEX "idx_availability_slots_rule_starts_at" ON "availability_slots" USING btree ("availability_rule_id","starts_at");--> statement-breakpoint
CREATE INDEX "idx_availability_slots_start_time_starts_at" ON "availability_slots" USING btree ("start_time_id","starts_at");--> statement-breakpoint
CREATE INDEX "idx_availability_slots_date_starts_at" ON "availability_slots" USING btree ("date_local","starts_at");--> statement-breakpoint
CREATE INDEX "idx_availability_slots_status_starts_at" ON "availability_slots" USING btree ("status","starts_at");--> statement-breakpoint
CREATE INDEX "idx_availability_slots_starts_at" ON "availability_slots" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "idx_availability_start_times_product_sort_created" ON "availability_start_times" USING btree ("product_id","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_availability_start_times_option_sort_created" ON "availability_start_times" USING btree ("option_id","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_availability_start_times_facility_sort_created" ON "availability_start_times" USING btree ("facility_id","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_availability_start_times_active_sort_created" ON "availability_start_times" USING btree ("active","sort_order","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_product_option_resource_templates_option_kind" ON "product_option_resource_templates" USING btree ("product_option_id","kind",coalesce("ref_id", ''));--> statement-breakpoint
CREATE INDEX "idx_product_option_resource_templates_kind" ON "product_option_resource_templates" USING btree ("kind","created_at");--> statement-breakpoint
CREATE INDEX "idx_availability_holds_slot" ON "availability_holds" USING btree ("slot_id");--> statement-breakpoint
CREATE INDEX "idx_availability_holds_draft" ON "availability_holds" USING btree ("draft_id");--> statement-breakpoint
CREATE INDEX "idx_availability_holds_token" ON "availability_holds" USING btree ("hold_token");--> statement-breakpoint
CREATE INDEX "idx_availability_holds_expires" ON "availability_holds" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_availability_pickup_points_created" ON "availability_pickup_points" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_availability_pickup_points_product_created" ON "availability_pickup_points" USING btree ("product_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_availability_pickup_points_facility_created" ON "availability_pickup_points" USING btree ("facility_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_availability_pickup_points_active_created" ON "availability_pickup_points" USING btree ("active","created_at");--> statement-breakpoint
CREATE INDEX "idx_availability_slot_pickups_created" ON "availability_slot_pickups" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_availability_slot_pickups_slot_created" ON "availability_slot_pickups" USING btree ("slot_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_availability_slot_pickups_pickup_point_created" ON "availability_slot_pickups" USING btree ("pickup_point_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_custom_pickup_areas_created" ON "custom_pickup_areas" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_custom_pickup_areas_meeting_config_created" ON "custom_pickup_areas" USING btree ("meeting_config_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_custom_pickup_areas_active_created" ON "custom_pickup_areas" USING btree ("active","created_at");--> statement-breakpoint
CREATE INDEX "idx_location_pickup_times_created" ON "location_pickup_times" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_location_pickup_times_pickup_location_created" ON "location_pickup_times" USING btree ("pickup_location_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_location_pickup_times_slot_created" ON "location_pickup_times" USING btree ("slot_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_location_pickup_times_start_time_created" ON "location_pickup_times" USING btree ("start_time_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_location_pickup_times_active_created" ON "location_pickup_times" USING btree ("active","created_at");--> statement-breakpoint
CREATE INDEX "idx_pickup_groups_sort_created" ON "pickup_groups" USING btree ("sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_pickup_groups_meeting_config_sort_created" ON "pickup_groups" USING btree ("meeting_config_id","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_pickup_groups_kind_sort_created" ON "pickup_groups" USING btree ("kind","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_pickup_groups_active_sort_created" ON "pickup_groups" USING btree ("active","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_pickup_locations_sort_created" ON "pickup_locations" USING btree ("sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_pickup_locations_group_sort_created" ON "pickup_locations" USING btree ("group_id","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_pickup_locations_facility_sort_created" ON "pickup_locations" USING btree ("facility_id","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_pickup_locations_active_sort_created" ON "pickup_locations" USING btree ("active","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_product_meeting_configs_updated" ON "product_meeting_configs" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "idx_product_meeting_configs_product_updated" ON "product_meeting_configs" USING btree ("product_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_product_meeting_configs_option_updated" ON "product_meeting_configs" USING btree ("option_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_product_meeting_configs_facility_updated" ON "product_meeting_configs" USING btree ("facility_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_product_meeting_configs_mode_updated" ON "product_meeting_configs" USING btree ("mode","updated_at");--> statement-breakpoint
CREATE INDEX "idx_product_meeting_configs_active_updated" ON "product_meeting_configs" USING btree ("active","updated_at");--> statement-breakpoint
CREATE INDEX "idx_ground_dispatches_preference_service_date_created" ON "ground_dispatches" USING btree ("transfer_preference_id","service_date","created_at");--> statement-breakpoint
CREATE INDEX "idx_ground_dispatches_booking_service_date_created" ON "ground_dispatches" USING btree ("booking_id","service_date","created_at");--> statement-breakpoint
CREATE INDEX "idx_ground_dispatches_booking_item_service_date_created" ON "ground_dispatches" USING btree ("booking_item_id","service_date","created_at");--> statement-breakpoint
CREATE INDEX "idx_ground_dispatches_operator_service_date_created" ON "ground_dispatches" USING btree ("operator_id","service_date","created_at");--> statement-breakpoint
CREATE INDEX "idx_ground_dispatches_vehicle_service_date_created" ON "ground_dispatches" USING btree ("vehicle_id","service_date","created_at");--> statement-breakpoint
CREATE INDEX "idx_ground_dispatches_driver_service_date_created" ON "ground_dispatches" USING btree ("driver_id","service_date","created_at");--> statement-breakpoint
CREATE INDEX "idx_ground_dispatches_status_service_date_created" ON "ground_dispatches" USING btree ("status","service_date","created_at");--> statement-breakpoint
CREATE INDEX "idx_ground_dispatches_service_date_created" ON "ground_dispatches" USING btree ("service_date","created_at");--> statement-breakpoint
CREATE INDEX "idx_ground_transfer_preferences_booking_created" ON "ground_transfer_preferences" USING btree ("booking_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_ground_transfer_preferences_booking_item_created" ON "ground_transfer_preferences" USING btree ("booking_item_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_ground_transfer_preferences_pickup_facility_created" ON "ground_transfer_preferences" USING btree ("pickup_facility_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_ground_transfer_preferences_dropoff_facility_created" ON "ground_transfer_preferences" USING btree ("dropoff_facility_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_ground_transfer_preferences_service_level_created" ON "ground_transfer_preferences" USING btree ("service_level","created_at");--> statement-breakpoint
CREATE INDEX "idx_ground_dispatch_assignments_dispatch_assigned" ON "ground_dispatch_assignments" USING btree ("dispatch_id","assigned_at");--> statement-breakpoint
CREATE INDEX "idx_ground_dispatch_assignments_operator_assigned" ON "ground_dispatch_assignments" USING btree ("operator_id","assigned_at");--> statement-breakpoint
CREATE INDEX "idx_ground_dispatch_assignments_vehicle_assigned" ON "ground_dispatch_assignments" USING btree ("vehicle_id","assigned_at");--> statement-breakpoint
CREATE INDEX "idx_ground_dispatch_assignments_driver_assigned" ON "ground_dispatch_assignments" USING btree ("driver_id","assigned_at");--> statement-breakpoint
CREATE INDEX "idx_ground_dispatch_assignments_source_assigned" ON "ground_dispatch_assignments" USING btree ("assignment_source","assigned_at");--> statement-breakpoint
CREATE INDEX "idx_ground_dispatch_checkpoints_dispatch_sequence" ON "ground_dispatch_checkpoints" USING btree ("dispatch_id","sequence");--> statement-breakpoint
CREATE INDEX "idx_ground_dispatch_checkpoints_status_sequence" ON "ground_dispatch_checkpoints" USING btree ("status","sequence");--> statement-breakpoint
CREATE INDEX "idx_ground_dispatch_checkpoints_facility_sequence" ON "ground_dispatch_checkpoints" USING btree ("facility_id","sequence");--> statement-breakpoint
CREATE INDEX "idx_ground_dispatch_legs_dispatch_sequence" ON "ground_dispatch_legs" USING btree ("dispatch_id","sequence");--> statement-breakpoint
CREATE INDEX "idx_ground_dispatch_legs_type_sequence" ON "ground_dispatch_legs" USING btree ("leg_type","sequence");--> statement-breakpoint
CREATE INDEX "idx_ground_dispatch_legs_facility_sequence" ON "ground_dispatch_legs" USING btree ("facility_id","sequence");--> statement-breakpoint
CREATE INDEX "idx_ground_dispatch_passengers_dispatch_created" ON "ground_dispatch_passengers" USING btree ("dispatch_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_ground_dispatch_passengers_participant_created" ON "ground_dispatch_passengers" USING btree ("participant_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_ground_driver_shifts_starts_at" ON "ground_driver_shifts" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "idx_ground_driver_shifts_driver_starts_at" ON "ground_driver_shifts" USING btree ("driver_id","starts_at");--> statement-breakpoint
CREATE INDEX "idx_ground_driver_shifts_operator_starts_at" ON "ground_driver_shifts" USING btree ("operator_id","starts_at");--> statement-breakpoint
CREATE INDEX "idx_ground_driver_shifts_facility_starts_at" ON "ground_driver_shifts" USING btree ("facility_id","starts_at");--> statement-breakpoint
CREATE INDEX "idx_ground_driver_shifts_status_starts_at" ON "ground_driver_shifts" USING btree ("status","starts_at");--> statement-breakpoint
CREATE INDEX "idx_ground_execution_events_dispatch_occurred_created" ON "ground_execution_events" USING btree ("dispatch_id","occurred_at","created_at");--> statement-breakpoint
CREATE INDEX "idx_ground_execution_events_type_occurred_created" ON "ground_execution_events" USING btree ("event_type","occurred_at","created_at");--> statement-breakpoint
CREATE INDEX "idx_ground_execution_events_facility_occurred_created" ON "ground_execution_events" USING btree ("facility_id","occurred_at","created_at");--> statement-breakpoint
CREATE INDEX "idx_ground_execution_events_occurred_at" ON "ground_execution_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "idx_ground_service_incidents_dispatch_opened" ON "ground_service_incidents" USING btree ("dispatch_id","opened_at");--> statement-breakpoint
CREATE INDEX "idx_ground_service_incidents_severity_opened" ON "ground_service_incidents" USING btree ("severity","opened_at");--> statement-breakpoint
CREATE INDEX "idx_ground_service_incidents_resolution_opened" ON "ground_service_incidents" USING btree ("resolution_status","opened_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_ground_drivers_resource" ON "ground_drivers" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX "idx_ground_drivers_created" ON "ground_drivers" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_ground_drivers_operator_created" ON "ground_drivers" USING btree ("operator_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_ground_drivers_active_created" ON "ground_drivers" USING btree ("active","created_at");--> statement-breakpoint
CREATE INDEX "idx_ground_operators_name_created" ON "ground_operators" USING btree ("name","created_at");--> statement-breakpoint
CREATE INDEX "idx_ground_operators_supplier_name_created" ON "ground_operators" USING btree ("supplier_id","name","created_at");--> statement-breakpoint
CREATE INDEX "idx_ground_operators_facility_name_created" ON "ground_operators" USING btree ("facility_id","name","created_at");--> statement-breakpoint
CREATE INDEX "idx_ground_operators_active_name_created" ON "ground_operators" USING btree ("active","name","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_ground_vehicles_resource" ON "ground_vehicles" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX "idx_ground_vehicles_created" ON "ground_vehicles" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_ground_vehicles_operator_created" ON "ground_vehicles" USING btree ("operator_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_ground_vehicles_category_created" ON "ground_vehicles" USING btree ("category","created_at");--> statement-breakpoint
CREATE INDEX "idx_ground_vehicles_active_created" ON "ground_vehicles" USING btree ("active","created_at");--> statement-breakpoint
CREATE INDEX "idx_facilities_parent_updated" ON "facilities" USING btree ("parent_facility_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_facilities_owner_updated" ON "facilities" USING btree ("owner_type","owner_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_facilities_owner_id_updated" ON "facilities" USING btree ("owner_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_facilities_kind_updated" ON "facilities" USING btree ("kind","updated_at");--> statement-breakpoint
CREATE INDEX "idx_facilities_status_updated" ON "facilities" USING btree ("status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_facilities_code" ON "facilities" USING btree ("code");--> statement-breakpoint
CREATE INDEX "idx_facility_address_projections_country" ON "facility_address_projections" USING btree ("country");--> statement-breakpoint
CREATE INDEX "idx_facility_address_projections_city_country" ON "facility_address_projections" USING btree ("city","country");--> statement-breakpoint
CREATE INDEX "idx_facility_features_facility_sort_name" ON "facility_features" USING btree ("facility_id","sort_order","name");--> statement-breakpoint
CREATE INDEX "idx_facility_features_category_sort_name" ON "facility_features" USING btree ("category","sort_order","name");--> statement-breakpoint
CREATE INDEX "idx_facility_features_facility_category_sort_name" ON "facility_features" USING btree ("facility_id","category","sort_order","name");--> statement-breakpoint
CREATE INDEX "idx_facility_operation_schedules_facility_day_valid" ON "facility_operation_schedules" USING btree ("facility_id","day_of_week","valid_from");--> statement-breakpoint
CREATE INDEX "idx_facility_operation_schedules_day_valid" ON "facility_operation_schedules" USING btree ("day_of_week","valid_from");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_properties_facility" ON "properties" USING btree ("facility_id");--> statement-breakpoint
CREATE INDEX "idx_properties_updated" ON "properties" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "idx_properties_type_updated" ON "properties" USING btree ("property_type","updated_at");--> statement-breakpoint
CREATE INDEX "idx_properties_group_updated" ON "properties" USING btree ("group_name","updated_at");--> statement-breakpoint
CREATE INDEX "idx_property_group_members_group_updated" ON "property_group_members" USING btree ("group_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_property_group_members_updated" ON "property_group_members" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "idx_property_group_members_property_updated" ON "property_group_members" USING btree ("property_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_property_group_members_role_updated" ON "property_group_members" USING btree ("membership_role","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_property_group_members_pair" ON "property_group_members" USING btree ("group_id","property_id");--> statement-breakpoint
CREATE INDEX "idx_property_groups_parent_updated" ON "property_groups" USING btree ("parent_group_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_property_groups_updated" ON "property_groups" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "idx_property_groups_type_updated" ON "property_groups" USING btree ("group_type","updated_at");--> statement-breakpoint
CREATE INDEX "idx_property_groups_status_updated" ON "property_groups" USING btree ("status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_property_groups_code" ON "property_groups" USING btree ("code");--> statement-breakpoint
CREATE INDEX "idx_resource_requirements_pool_priority_created" ON "resource_requirements" USING btree ("pool_id","priority","created_at");--> statement-breakpoint
CREATE INDEX "idx_resource_requirements_product_priority_created" ON "resource_requirements" USING btree ("product_id","priority","created_at");--> statement-breakpoint
CREATE INDEX "idx_resource_requirements_rule_priority_created" ON "resource_requirements" USING btree ("availability_rule_id","priority","created_at");--> statement-breakpoint
CREATE INDEX "idx_resource_requirements_start_time_priority_created" ON "resource_requirements" USING btree ("start_time_id","priority","created_at");--> statement-breakpoint
CREATE INDEX "idx_resource_closeouts_resource_created" ON "resource_closeouts" USING btree ("resource_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_resource_closeouts_date_created" ON "resource_closeouts" USING btree ("date_local","created_at");--> statement-breakpoint
CREATE INDEX "idx_resource_pool_members_created" ON "resource_pool_members" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_resource_pool_members_pool_created" ON "resource_pool_members" USING btree ("pool_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_resource_pool_members_resource_created" ON "resource_pool_members" USING btree ("resource_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_resource_pools_created" ON "resource_pools" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_resource_pools_product_created" ON "resource_pools" USING btree ("product_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_resource_pools_kind_created" ON "resource_pools" USING btree ("kind","created_at");--> statement-breakpoint
CREATE INDEX "idx_resource_pools_active_created" ON "resource_pools" USING btree ("active","created_at");--> statement-breakpoint
CREATE INDEX "idx_resource_slot_assignments_slot_assigned" ON "resource_slot_assignments" USING btree ("slot_id","assigned_at");--> statement-breakpoint
CREATE INDEX "idx_resource_slot_assignments_pool_assigned" ON "resource_slot_assignments" USING btree ("pool_id","assigned_at");--> statement-breakpoint
CREATE INDEX "idx_resource_slot_assignments_resource_assigned" ON "resource_slot_assignments" USING btree ("resource_id","assigned_at");--> statement-breakpoint
CREATE INDEX "idx_resource_slot_assignments_booking_assigned" ON "resource_slot_assignments" USING btree ("booking_id","assigned_at");--> statement-breakpoint
CREATE INDEX "idx_resource_slot_assignments_status_assigned" ON "resource_slot_assignments" USING btree ("status","assigned_at");--> statement-breakpoint
CREATE INDEX "idx_resources_created" ON "resources" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_resources_supplier_created" ON "resources" USING btree ("supplier_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_resources_facility_created" ON "resources" USING btree ("facility_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_resources_kind_created" ON "resources" USING btree ("kind","created_at");--> statement-breakpoint
CREATE INDEX "idx_resources_active_created" ON "resources" USING btree ("active","created_at");--> statement-breakpoint
CREATE INDEX "idx_notification_deliveries_created" ON "notification_deliveries" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_notification_deliveries_template_created" ON "notification_deliveries" USING btree ("template_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_notification_deliveries_target_created" ON "notification_deliveries" USING btree ("target_type","target_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_notification_deliveries_person_created" ON "notification_deliveries" USING btree ("person_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_notification_deliveries_org_created" ON "notification_deliveries" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_notification_deliveries_booking_created" ON "notification_deliveries" USING btree ("booking_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_notification_deliveries_invoice_created" ON "notification_deliveries" USING btree ("invoice_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_notification_deliveries_payment_session_created" ON "notification_deliveries" USING btree ("payment_session_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_notification_deliveries_channel_created" ON "notification_deliveries" USING btree ("channel","created_at");--> statement-breakpoint
CREATE INDEX "idx_notification_deliveries_provider_created" ON "notification_deliveries" USING btree ("provider","created_at");--> statement-breakpoint
CREATE INDEX "idx_notification_deliveries_status_created" ON "notification_deliveries" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "idx_notification_deliveries_scheduled_for" ON "notification_deliveries" USING btree ("scheduled_for");--> statement-breakpoint
CREATE INDEX "idx_notification_reminder_rule_authoring_rule" ON "notification_reminder_rule_authoring_requests" USING btree ("reminder_rule_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_notification_reminder_rule_stages_rule_order" ON "notification_reminder_rule_stages" USING btree ("reminder_rule_id","order_index");--> statement-breakpoint
CREATE INDEX "idx_notification_reminder_rule_stages_rule" ON "notification_reminder_rule_stages" USING btree ("reminder_rule_id");--> statement-breakpoint
CREATE INDEX "idx_notification_reminder_rule_stages_anchor" ON "notification_reminder_rule_stages" USING btree ("anchor");--> statement-breakpoint
CREATE INDEX "idx_notification_reminder_rules_updated" ON "notification_reminder_rules" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "idx_notification_reminder_rules_status_updated" ON "notification_reminder_rules" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "idx_notification_reminder_rules_target_updated" ON "notification_reminder_rules" USING btree ("target_type","updated_at");--> statement-breakpoint
CREATE INDEX "idx_notification_reminder_rules_channel_updated" ON "notification_reminder_rules" USING btree ("channel","updated_at");--> statement-breakpoint
CREATE INDEX "idx_notification_reminder_rules_priority" ON "notification_reminder_rules" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "idx_notification_reminder_rules_suppression_group" ON "notification_reminder_rules" USING btree ("suppression_group");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_notification_reminder_rules_slug" ON "notification_reminder_rules" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_notification_reminder_runs_created" ON "notification_reminder_runs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_notification_reminder_runs_rule_created" ON "notification_reminder_runs" USING btree ("reminder_rule_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_notification_reminder_runs_target_created" ON "notification_reminder_runs" USING btree ("target_type","target_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_notification_reminder_runs_booking_created" ON "notification_reminder_runs" USING btree ("booking_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_notification_reminder_runs_payment_session_created" ON "notification_reminder_runs" USING btree ("payment_session_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_notification_reminder_runs_delivery_created" ON "notification_reminder_runs" USING btree ("notification_delivery_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_notification_reminder_runs_person_created" ON "notification_reminder_runs" USING btree ("person_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_notification_reminder_runs_org_created" ON "notification_reminder_runs" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_notification_reminder_runs_recipient_created" ON "notification_reminder_runs" USING btree ("recipient","created_at");--> statement-breakpoint
CREATE INDEX "idx_notification_reminder_runs_status_created" ON "notification_reminder_runs" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_notification_reminder_runs_dedupe" ON "notification_reminder_runs" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "idx_notification_reminder_stage_channels_stage" ON "notification_reminder_stage_channels" USING btree ("stage_id");--> statement-breakpoint
CREATE INDEX "idx_notification_reminder_stage_channels_template" ON "notification_reminder_stage_channels" USING btree ("template_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_notification_settings_scope" ON "notification_settings" USING btree ("scope");--> statement-breakpoint
CREATE INDEX "idx_notification_templates_updated" ON "notification_templates" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "idx_notification_templates_channel_updated" ON "notification_templates" USING btree ("channel","updated_at");--> statement-breakpoint
CREATE INDEX "idx_notification_templates_provider_updated" ON "notification_templates" USING btree ("provider","updated_at");--> statement-breakpoint
CREATE INDEX "idx_notification_templates_status_updated" ON "notification_templates" USING btree ("status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_notification_templates_slug" ON "notification_templates" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_contract_attachments_contract" ON "contract_attachments" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "idx_contract_attachments_contract_created" ON "contract_attachments" USING btree ("contract_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_contract_attachments_target" ON "contract_attachments" USING btree ("target_kind","target_id");--> statement-breakpoint
CREATE INDEX "idx_contract_attachments_provider_source" ON "contract_attachments" USING btree ("target_provider","target_source_ref");--> statement-breakpoint
CREATE INDEX "idx_contract_attachments_legacy_transaction_offer" ON "contract_attachments" USING btree ("legacy_transaction_offer_id");--> statement-breakpoint
CREATE INDEX "idx_contract_attachments_legacy_transaction_order" ON "contract_attachments" USING btree ("legacy_transaction_order_id");--> statement-breakpoint
CREATE INDEX "idx_contract_number_series_scope" ON "contract_number_series" USING btree ("scope");--> statement-breakpoint
CREATE INDEX "idx_contract_number_series_active" ON "contract_number_series" USING btree ("active");--> statement-breakpoint
CREATE INDEX "idx_contract_number_series_scope_default" ON "contract_number_series" USING btree ("scope","is_default");--> statement-breakpoint
CREATE INDEX "idx_contract_number_series_external_provider" ON "contract_number_series" USING btree ("external_provider");--> statement-breakpoint
CREATE INDEX "idx_contract_number_series_scope_updated" ON "contract_number_series" USING btree ("scope","updated_at");--> statement-breakpoint
CREATE INDEX "idx_contract_number_series_active_updated" ON "contract_number_series" USING btree ("active","updated_at");--> statement-breakpoint
CREATE INDEX "idx_contract_number_series_updated" ON "contract_number_series" USING btree ("updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_contract_number_series_prefix_scope_active" ON "contract_number_series" USING btree ("prefix","scope") WHERE "contract_number_series"."active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_contract_number_series_default_scope_active" ON "contract_number_series" USING btree ("scope") WHERE "contract_number_series"."active" = true AND "contract_number_series"."is_default" = true;--> statement-breakpoint
CREATE INDEX "idx_contract_signatures_contract" ON "contract_signatures" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "idx_contract_signatures_contract_signed" ON "contract_signatures" USING btree ("contract_id","signed_at");--> statement-breakpoint
CREATE INDEX "idx_contract_signatures_person" ON "contract_signatures" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "idx_contract_signatures_target" ON "contract_signatures" USING btree ("target_kind","target_id");--> statement-breakpoint
CREATE INDEX "idx_contract_signatures_provider_source" ON "contract_signatures" USING btree ("target_provider","target_source_ref");--> statement-breakpoint
CREATE INDEX "idx_contract_signatures_legacy_transaction_offer" ON "contract_signatures" USING btree ("legacy_transaction_offer_id");--> statement-breakpoint
CREATE INDEX "idx_contract_signatures_legacy_transaction_order" ON "contract_signatures" USING btree ("legacy_transaction_order_id");--> statement-breakpoint
CREATE INDEX "idx_contract_signatures_method" ON "contract_signatures" USING btree ("method");--> statement-breakpoint
CREATE INDEX "idx_contract_template_versions_template" ON "contract_template_versions" USING btree ("template_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_contract_template_versions_template_version" ON "contract_template_versions" USING btree ("template_id","version");--> statement-breakpoint
CREATE INDEX "idx_contract_templates_scope" ON "contract_templates" USING btree ("scope");--> statement-breakpoint
CREATE INDEX "idx_contract_templates_language" ON "contract_templates" USING btree ("language");--> statement-breakpoint
CREATE INDEX "idx_contract_templates_channel" ON "contract_templates" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "idx_contract_templates_active" ON "contract_templates" USING btree ("active");--> statement-breakpoint
CREATE INDEX "idx_contract_templates_default_selector" ON "contract_templates" USING btree ("scope","channel_id","language","is_default","active");--> statement-breakpoint
CREATE INDEX "idx_contract_templates_scope_updated" ON "contract_templates" USING btree ("scope","updated_at");--> statement-breakpoint
CREATE INDEX "idx_contract_templates_language_updated" ON "contract_templates" USING btree ("language","updated_at");--> statement-breakpoint
CREATE INDEX "idx_contract_templates_active_updated" ON "contract_templates" USING btree ("active","updated_at");--> statement-breakpoint
CREATE INDEX "idx_contract_templates_scope_active_updated" ON "contract_templates" USING btree ("scope","active","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_contract_templates_slug" ON "contract_templates" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_contract_templates_default_global" ON "contract_templates" USING btree ("scope","language") WHERE "contract_templates"."is_default" = true AND "contract_templates"."channel_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_contract_templates_default_channel" ON "contract_templates" USING btree ("scope","channel_id","language") WHERE "contract_templates"."is_default" = true AND "contract_templates"."channel_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_contracts_scope" ON "contracts" USING btree ("scope");--> statement-breakpoint
CREATE INDEX "idx_contracts_status" ON "contracts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_contracts_template_version" ON "contracts" USING btree ("template_version_id");--> statement-breakpoint
CREATE INDEX "idx_contracts_series" ON "contracts" USING btree ("series_id");--> statement-breakpoint
CREATE INDEX "idx_contracts_person" ON "contracts" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "idx_contracts_organization" ON "contracts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_contracts_supplier" ON "contracts" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "idx_contracts_booking" ON "contracts" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "idx_contracts_target" ON "contracts" USING btree ("target_kind","target_id");--> statement-breakpoint
CREATE INDEX "idx_contracts_provider_source" ON "contracts" USING btree ("target_provider","target_source_ref");--> statement-breakpoint
CREATE INDEX "idx_contracts_legacy_transaction_offer" ON "contracts" USING btree ("legacy_transaction_offer_id");--> statement-breakpoint
CREATE INDEX "idx_contracts_legacy_transaction_order" ON "contracts" USING btree ("legacy_transaction_order_id");--> statement-breakpoint
CREATE INDEX "idx_contracts_scope_created" ON "contracts" USING btree ("scope","created_at");--> statement-breakpoint
CREATE INDEX "idx_contracts_status_created" ON "contracts" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "idx_contracts_person_created" ON "contracts" USING btree ("person_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_contracts_organization_created" ON "contracts" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_contracts_supplier_created" ON "contracts" USING btree ("supplier_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_contracts_booking_created" ON "contracts" USING btree ("booking_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_contracts_target_created" ON "contracts" USING btree ("target_kind","target_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_contracts_contract_number" ON "contracts" USING btree ("contract_number");--> statement-breakpoint
CREATE INDEX "idx_policies_kind" ON "policies" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "idx_policies_language" ON "policies" USING btree ("language");--> statement-breakpoint
CREATE INDEX "idx_policies_kind_updated" ON "policies" USING btree ("kind","updated_at");--> statement-breakpoint
CREATE INDEX "idx_policies_language_updated" ON "policies" USING btree ("language","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_policies_slug" ON "policies" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_policy_acceptances_version" ON "policy_acceptances" USING btree ("policy_version_id");--> statement-breakpoint
CREATE INDEX "idx_policy_acceptances_person" ON "policy_acceptances" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "idx_policy_acceptances_booking" ON "policy_acceptances" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "idx_policy_acceptances_target" ON "policy_acceptances" USING btree ("target_kind","target_id");--> statement-breakpoint
CREATE INDEX "idx_policy_acceptances_provider_source" ON "policy_acceptances" USING btree ("target_provider","target_source_ref");--> statement-breakpoint
CREATE INDEX "idx_policy_acceptances_legacy_transaction_offer" ON "policy_acceptances" USING btree ("legacy_transaction_offer_id");--> statement-breakpoint
CREATE INDEX "idx_policy_acceptances_legacy_transaction_order" ON "policy_acceptances" USING btree ("legacy_transaction_order_id");--> statement-breakpoint
CREATE INDEX "idx_policy_acceptances_version_accepted" ON "policy_acceptances" USING btree ("policy_version_id","accepted_at");--> statement-breakpoint
CREATE INDEX "idx_policy_acceptances_person_accepted" ON "policy_acceptances" USING btree ("person_id","accepted_at");--> statement-breakpoint
CREATE INDEX "idx_policy_acceptances_booking_accepted" ON "policy_acceptances" USING btree ("booking_id","accepted_at");--> statement-breakpoint
CREATE INDEX "idx_policy_acceptances_target_accepted" ON "policy_acceptances" USING btree ("target_kind","target_id","accepted_at");--> statement-breakpoint
CREATE INDEX "idx_policy_assignments_policy" ON "policy_assignments" USING btree ("policy_id");--> statement-breakpoint
CREATE INDEX "idx_policy_assignments_scope" ON "policy_assignments" USING btree ("scope");--> statement-breakpoint
CREATE INDEX "idx_policy_assignments_product" ON "policy_assignments" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_policy_assignments_channel" ON "policy_assignments" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "idx_policy_assignments_supplier" ON "policy_assignments" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "idx_policy_assignments_market" ON "policy_assignments" USING btree ("market_id");--> statement-breakpoint
CREATE INDEX "idx_policy_assignments_organization" ON "policy_assignments" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_policy_assignments_priority" ON "policy_assignments" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "idx_policy_assignments_policy_priority_created" ON "policy_assignments" USING btree ("policy_id","priority","created_at");--> statement-breakpoint
CREATE INDEX "idx_policy_assignments_scope_priority_created" ON "policy_assignments" USING btree ("scope","priority","created_at");--> statement-breakpoint
CREATE INDEX "idx_policy_assignments_product_priority_created" ON "policy_assignments" USING btree ("product_id","priority","created_at");--> statement-breakpoint
CREATE INDEX "idx_policy_assignments_channel_priority_created" ON "policy_assignments" USING btree ("channel_id","priority","created_at");--> statement-breakpoint
CREATE INDEX "idx_policy_assignments_supplier_priority_created" ON "policy_assignments" USING btree ("supplier_id","priority","created_at");--> statement-breakpoint
CREATE INDEX "idx_policy_assignments_market_priority_created" ON "policy_assignments" USING btree ("market_id","priority","created_at");--> statement-breakpoint
CREATE INDEX "idx_policy_assignments_organization_priority_created" ON "policy_assignments" USING btree ("organization_id","priority","created_at");--> statement-breakpoint
CREATE INDEX "idx_policy_rules_version" ON "policy_rules" USING btree ("policy_version_id");--> statement-breakpoint
CREATE INDEX "idx_policy_rules_version_sort_created" ON "policy_rules" USING btree ("policy_version_id","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_policy_rules_type" ON "policy_rules" USING btree ("rule_type");--> statement-breakpoint
CREATE INDEX "idx_policy_rules_sort" ON "policy_rules" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "idx_policy_versions_policy" ON "policy_versions" USING btree ("policy_id");--> statement-breakpoint
CREATE INDEX "idx_policy_versions_status" ON "policy_versions" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_policy_versions_policy_version" ON "policy_versions" USING btree ("policy_id","version");--> statement-breakpoint
CREATE INDEX "idx_legal_terms_contract_sort" ON "legal_terms" USING btree ("contract_id","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_legal_terms_policy_version_sort" ON "legal_terms" USING btree ("policy_version_id","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_legal_terms_target_sort" ON "legal_terms" USING btree ("target_kind","target_id","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_legal_terms_provider_source_sort" ON "legal_terms" USING btree ("target_provider","target_source_ref","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_legal_terms_legacy_transaction_offer_sort" ON "legal_terms" USING btree ("legacy_transaction_offer_id","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_legal_terms_legacy_transaction_order_sort" ON "legal_terms" USING btree ("legacy_transaction_order_id","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_legal_terms_type_sort" ON "legal_terms" USING btree ("term_type","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_legal_terms_acceptance_sort" ON "legal_terms" USING btree ("acceptance_status","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_storefront_verification_channel" ON "storefront_verification_challenges" USING btree ("channel");--> statement-breakpoint
CREATE INDEX "idx_storefront_verification_destination" ON "storefront_verification_challenges" USING btree ("destination");--> statement-breakpoint
CREATE INDEX "idx_storefront_verification_purpose" ON "storefront_verification_challenges" USING btree ("purpose");--> statement-breakpoint
CREATE INDEX "idx_storefront_verification_status" ON "storefront_verification_challenges" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_storefront_verification_lookup" ON "storefront_verification_challenges" USING btree ("channel","destination","purpose","updated_at","created_at");--> statement-breakpoint
CREATE INDEX "idx_trip_component_events_envelope_time" ON "trip_component_events" USING btree ("envelope_id","occurred_at");--> statement-breakpoint
CREATE INDEX "idx_trip_component_events_component_time" ON "trip_component_events" USING btree ("component_id","occurred_at");--> statement-breakpoint
CREATE INDEX "idx_trip_component_events_type_time" ON "trip_component_events" USING btree ("event_type","occurred_at");--> statement-breakpoint
CREATE INDEX "idx_trip_components_envelope_sequence" ON "trip_components" USING btree ("envelope_id","sequence");--> statement-breakpoint
CREATE INDEX "idx_trip_components_envelope_status" ON "trip_components" USING btree ("envelope_id","status");--> statement-breakpoint
CREATE INDEX "idx_trip_components_catalog_entity" ON "trip_components" USING btree ("entity_module","entity_id");--> statement-breakpoint
CREATE INDEX "idx_trip_components_booking_draft" ON "trip_components" USING btree ("booking_draft_id");--> statement-breakpoint
CREATE INDEX "idx_trip_components_catalog_quote" ON "trip_components" USING btree ("catalog_quote_id");--> statement-breakpoint
CREATE INDEX "idx_trip_components_booking" ON "trip_components" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "idx_trip_components_order" ON "trip_components" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_trip_components_payment_session" ON "trip_components" USING btree ("payment_session_id");--> statement-breakpoint
CREATE INDEX "idx_trip_envelopes_status_updated" ON "trip_envelopes" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "idx_trip_envelopes_created_by_updated" ON "trip_envelopes" USING btree ("created_by","updated_at");--> statement-breakpoint
CREATE INDEX "idx_trip_envelopes_booking_group" ON "trip_envelopes" USING btree ("booking_group_id");--> statement-breakpoint
CREATE INDEX "idx_trip_envelopes_payment_session" ON "trip_envelopes" USING btree ("payment_session_id");--> statement-breakpoint
CREATE INDEX "idx_trip_envelopes_reserve_idempotency" ON "trip_envelopes" USING btree ("reserve_idempotency_key");--> statement-breakpoint
CREATE INDEX "idx_trip_envelopes_checkout_idempotency" ON "trip_envelopes" USING btree ("checkout_idempotency_key");--> statement-breakpoint
CREATE INDEX "idx_trip_reservation_plans_envelope_created" ON "trip_reservation_plans" USING btree ("envelope_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_trip_reservation_plans_snapshot" ON "trip_reservation_plans" USING btree ("snapshot_id");--> statement-breakpoint
CREATE INDEX "idx_trip_reservation_plans_status_updated" ON "trip_reservation_plans" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "idx_trip_reservation_plans_idempotency" ON "trip_reservation_plans" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "idx_trip_snapshots_envelope_created" ON "trip_snapshots" USING btree ("envelope_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_trip_snapshots_created" ON "trip_snapshots" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_par_product" ON "product_authoring_requests" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_workflow_run_steps_run" ON "workflow_run_steps" USING btree ("run_id","sequence");--> statement-breakpoint
CREATE INDEX "idx_workflow_run_steps_status" ON "workflow_run_steps" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_workflow_runs_workflow" ON "workflow_runs" USING btree ("workflow_name","started_at");--> statement-breakpoint
CREATE INDEX "idx_workflow_runs_status_started" ON "workflow_runs" USING btree ("status","started_at");--> statement-breakpoint
CREATE INDEX "idx_workflow_runs_correlation" ON "workflow_runs" USING btree ("correlation_id");--> statement-breakpoint
CREATE INDEX "idx_workflow_runs_parent" ON "workflow_runs" USING btree ("parent_run_id");--> statement-breakpoint
CREATE INDEX "idx_workflow_runs_tags_gin" ON "workflow_runs" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "idx_stay_booking_items_booking_item" ON "stay_booking_items" USING btree ("booking_item_id");--> statement-breakpoint
CREATE INDEX "idx_stay_booking_items_check_in" ON "stay_booking_items" USING btree ("check_in_date");--> statement-breakpoint
CREATE INDEX "idx_stay_booking_items_property_check_in" ON "stay_booking_items" USING btree ("property_id","check_in_date");--> statement-breakpoint
CREATE INDEX "idx_stay_booking_items_room_type_check_in" ON "stay_booking_items" USING btree ("room_type_id","check_in_date");--> statement-breakpoint
CREATE INDEX "idx_stay_booking_items_rate_plan_check_in" ON "stay_booking_items" USING btree ("rate_plan_id","check_in_date");--> statement-breakpoint
CREATE INDEX "idx_stay_booking_items_status_check_in" ON "stay_booking_items" USING btree ("status","check_in_date");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_stay_booking_items_booking_item" ON "stay_booking_items" USING btree ("booking_item_id");--> statement-breakpoint
CREATE INDEX "idx_stay_daily_rates_stay_booking_item" ON "stay_daily_rates" USING btree ("stay_booking_item_id");--> statement-breakpoint
CREATE INDEX "idx_stay_daily_rates_date" ON "stay_daily_rates" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_stay_daily_rates_item_date" ON "stay_daily_rates" USING btree ("stay_booking_item_id","date");--> statement-breakpoint
CREATE INDEX "idx_meal_plans_property_sort_name" ON "meal_plans" USING btree ("property_id","sort_order","name");--> statement-breakpoint
CREATE INDEX "idx_meal_plans_active_sort_name" ON "meal_plans" USING btree ("active","sort_order","name");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_meal_plans_property_code" ON "meal_plans" USING btree ("property_id","code");--> statement-breakpoint
CREATE INDEX "idx_rate_plan_room_types_rate_plan_sort_created" ON "rate_plan_room_types" USING btree ("rate_plan_id","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_rate_plan_room_types_room_type_sort_created" ON "rate_plan_room_types" USING btree ("room_type_id","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_rate_plan_room_types_product_sort_created" ON "rate_plan_room_types" USING btree ("product_id","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_rate_plan_room_types_option" ON "rate_plan_room_types" USING btree ("option_id");--> statement-breakpoint
CREATE INDEX "idx_rate_plan_room_types_unit" ON "rate_plan_room_types" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "idx_rate_plan_room_types_active_sort_created" ON "rate_plan_room_types" USING btree ("active","sort_order","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_rate_plan_room_types_pair" ON "rate_plan_room_types" USING btree ("rate_plan_id","room_type_id");--> statement-breakpoint
CREATE INDEX "idx_rate_plans_property_sort_name" ON "rate_plans" USING btree ("property_id","sort_order","name");--> statement-breakpoint
CREATE INDEX "idx_rate_plans_meal_plan_sort_name" ON "rate_plans" USING btree ("meal_plan_id","sort_order","name");--> statement-breakpoint
CREATE INDEX "idx_rate_plans_catalog" ON "rate_plans" USING btree ("price_catalog_id");--> statement-breakpoint
CREATE INDEX "idx_rate_plans_policy" ON "rate_plans" USING btree ("cancellation_policy_id");--> statement-breakpoint
CREATE INDEX "idx_rate_plans_market_sort_name" ON "rate_plans" USING btree ("market_id","sort_order","name");--> statement-breakpoint
CREATE INDEX "idx_rate_plans_active_sort_name" ON "rate_plans" USING btree ("active","sort_order","name");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_rate_plans_property_code" ON "rate_plans" USING btree ("property_id","code");--> statement-breakpoint
CREATE INDEX "idx_room_type_bed_configs_room_type_primary_created" ON "room_type_bed_configs" USING btree ("room_type_id","is_primary","created_at");--> statement-breakpoint
CREATE INDEX "idx_room_type_bed_configs_bed_type_primary_created" ON "room_type_bed_configs" USING btree ("bed_type","is_primary","created_at");--> statement-breakpoint
CREATE INDEX "idx_room_types_property_sort_name" ON "room_types" USING btree ("property_id","sort_order","name");--> statement-breakpoint
CREATE INDEX "idx_room_types_supplier_sort_name" ON "room_types" USING btree ("supplier_id","sort_order","name");--> statement-breakpoint
CREATE INDEX "idx_room_types_active_sort_name" ON "room_types" USING btree ("active","sort_order","name");--> statement-breakpoint
CREATE INDEX "idx_room_types_inventory_mode_sort_name" ON "room_types" USING btree ("inventory_mode","sort_order","name");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_room_types_property_code" ON "room_types" USING btree ("property_id","code");--> statement-breakpoint
CREATE INDEX "accommodations_sourced_content_locale_fresh_idx" ON "accommodations_sourced_content" USING btree ("locale","fresh_until");--> statement-breakpoint
CREATE INDEX "accommodations_sourced_content_returned_locale_idx" ON "accommodations_sourced_content" USING btree ("entity_id","returned_locale");--> statement-breakpoint
CREATE INDEX "accommodations_sourced_content_schema_version_idx" ON "accommodations_sourced_content" USING btree ("content_schema_version");--> statement-breakpoint
CREATE INDEX "idx_bchd_mode" ON "booking_charter_details" USING btree ("booking_mode");--> statement-breakpoint
CREATE INDEX "idx_bchd_source" ON "booking_charter_details" USING btree ("source");--> statement-breakpoint
CREATE INDEX "idx_bchd_voyage" ON "booking_charter_details" USING btree ("voyage_id");--> statement-breakpoint
CREATE INDEX "idx_bchd_suite" ON "booking_charter_details" USING btree ("suite_id");--> statement-breakpoint
CREATE INDEX "idx_bchd_yacht" ON "booking_charter_details" USING btree ("yacht_id");--> statement-breakpoint
CREATE INDEX "idx_bchd_myba_contract" ON "booking_charter_details" USING btree ("myba_contract_id");--> statement-breakpoint
CREATE INDEX "idx_bchd_connector_ref" ON "booking_charter_details" USING btree ("connector_booking_ref");--> statement-breakpoint
CREATE INDEX "idx_bchd_provider" ON "booking_charter_details" USING btree ("source_provider");--> statement-breakpoint
CREATE INDEX "charters_sourced_content_locale_fresh_idx" ON "charters_sourced_content" USING btree ("locale","fresh_until");--> statement-breakpoint
CREATE INDEX "charters_sourced_content_returned_locale_idx" ON "charters_sourced_content" USING btree ("entity_id","returned_locale");--> statement-breakpoint
CREATE INDEX "charters_sourced_content_schema_version_idx" ON "charters_sourced_content" USING btree ("content_schema_version");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_charter_products_slug" ON "charter_products" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_charter_products_status_created" ON "charter_products" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "idx_charter_products_supplier_status" ON "charter_products" USING btree ("line_supplier_id","status");--> statement-breakpoint
CREATE INDEX "idx_charter_products_earliest" ON "charter_products" USING btree ("earliest_voyage_cached","status");--> statement-breakpoint
CREATE INDEX "idx_charter_voyages_product_departure" ON "charter_voyages" USING btree ("product_id","departure_date");--> statement-breakpoint
CREATE INDEX "idx_charter_voyages_yacht_departure" ON "charter_voyages" USING btree ("yacht_id","departure_date");--> statement-breakpoint
CREATE INDEX "idx_charter_voyages_status_departure" ON "charter_voyages" USING btree ("sales_status","departure_date");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_charter_voyages_product_date_yacht" ON "charter_voyages" USING btree ("product_id","departure_date","yacht_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_charter_schedule_voyage_day" ON "charter_schedule_days" USING btree ("voyage_id","day_number");--> statement-breakpoint
CREATE INDEX "idx_charter_schedule_voyage" ON "charter_schedule_days" USING btree ("voyage_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_charter_suites_voyage_code" ON "charter_suites" USING btree ("voyage_id","suite_code");--> statement-breakpoint
CREATE INDEX "idx_charter_suites_voyage_availability" ON "charter_suites" USING btree ("voyage_id","availability");--> statement-breakpoint
CREATE INDEX "idx_charter_suites_voyage_category" ON "charter_suites" USING btree ("voyage_id","suite_category");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_charter_yachts_slug" ON "charter_yachts" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_charter_yachts_imo" ON "charter_yachts" USING btree ("imo");--> statement-breakpoint
CREATE INDEX "idx_charter_yachts_supplier_active" ON "charter_yachts" USING btree ("line_supplier_id","is_active");--> statement-breakpoint
CREATE INDEX "idx_charter_yachts_class_active" ON "charter_yachts" USING btree ("yacht_class","is_active");--> statement-breakpoint
CREATE INDEX "idx_bcd_source" ON "booking_cruise_details" USING btree ("source");--> statement-breakpoint
CREATE INDEX "idx_bcd_sailing" ON "booking_cruise_details" USING btree ("sailing_id");--> statement-breakpoint
CREATE INDEX "idx_bcd_cabin_category" ON "booking_cruise_details" USING btree ("cabin_category_id");--> statement-breakpoint
CREATE INDEX "idx_bcd_connector_ref" ON "booking_cruise_details" USING btree ("connector_booking_ref");--> statement-breakpoint
CREATE INDEX "idx_bcd_provider" ON "booking_cruise_details" USING btree ("source_provider");--> statement-breakpoint
CREATE INDEX "idx_bcd_air_arrangement" ON "booking_cruise_details" USING btree ("air_arrangement");--> statement-breakpoint
CREATE INDEX "idx_bgcd_source" ON "booking_group_cruise_details" USING btree ("source");--> statement-breakpoint
CREATE INDEX "idx_bgcd_sailing" ON "booking_group_cruise_details" USING btree ("sailing_id");--> statement-breakpoint
CREATE INDEX "idx_bgcd_connector_ref" ON "booking_group_cruise_details" USING btree ("connector_booking_ref");--> statement-breakpoint
CREATE INDEX "idx_bgcd_provider" ON "booking_group_cruise_details" USING btree ("source_provider");--> statement-breakpoint
CREATE INDEX "cruises_sourced_content_locale_fresh_idx" ON "cruises_sourced_content" USING btree ("locale","fresh_until");--> statement-breakpoint
CREATE INDEX "cruises_sourced_content_returned_locale_idx" ON "cruises_sourced_content" USING btree ("entity_id","returned_locale");--> statement-breakpoint
CREATE INDEX "cruises_sourced_content_schema_version_idx" ON "cruises_sourced_content" USING btree ("content_schema_version");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_cruise_cabin_categories_ship_code" ON "cruise_cabin_categories" USING btree ("ship_id","code");--> statement-breakpoint
CREATE INDEX "idx_cruise_cabin_categories_ship_type" ON "cruise_cabin_categories" USING btree ("ship_id","room_type");--> statement-breakpoint
CREATE INDEX "idx_cruise_cabin_categories_features_gin" ON "cruise_cabin_categories" USING gin ("feature_codes");--> statement-breakpoint
CREATE INDEX "idx_cruise_cabin_categories_beds_gin" ON "cruise_cabin_categories" USING gin ("bed_configurations");--> statement-breakpoint
CREATE INDEX "idx_cruise_cabin_categories_accessibility_gin" ON "cruise_cabin_categories" USING gin ("accessibility_features");--> statement-breakpoint
CREATE INDEX "idx_cruise_cabin_categories_view_type" ON "cruise_cabin_categories" USING btree ("view_type");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_cruise_cabins_category_number" ON "cruise_cabins" USING btree ("category_id","cabin_number");--> statement-breakpoint
CREATE INDEX "idx_cruise_cabins_deck" ON "cruise_cabins" USING btree ("deck_id");--> statement-breakpoint
CREATE INDEX "idx_cruise_cabins_active" ON "cruise_cabins" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_cruise_decks_ship_level" ON "cruise_decks" USING btree ("ship_id","level");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_cruise_decks_ship_name" ON "cruise_decks" USING btree ("ship_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_cruise_ships_slug" ON "cruise_ships" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_cruise_ships_imo" ON "cruise_ships" USING btree ("imo");--> statement-breakpoint
CREATE INDEX "idx_cruise_ships_supplier_active" ON "cruise_ships" USING btree ("line_supplier_id","is_active");--> statement-breakpoint
CREATE INDEX "idx_cruise_ships_type_active" ON "cruise_ships" USING btree ("ship_type","is_active");--> statement-breakpoint
CREATE INDEX "idx_cruise_enrichment_programs_cruise_kind_sort" ON "cruise_enrichment_programs" USING btree ("cruise_id","kind","sort_order");--> statement-breakpoint
CREATE INDEX "idx_cruise_inclusions_cruise_kind_sort" ON "cruise_inclusions" USING btree ("cruise_id","kind","sort_order");--> statement-breakpoint
CREATE INDEX "idx_cruise_media_cruise" ON "cruise_media" USING btree ("cruise_id");--> statement-breakpoint
CREATE INDEX "idx_cruise_media_sailing" ON "cruise_media" USING btree ("sailing_id");--> statement-breakpoint
CREATE INDEX "idx_cruise_media_cruise_cover_sort" ON "cruise_media" USING btree ("cruise_id","is_cover","sort_order");--> statement-breakpoint
CREATE INDEX "idx_cruise_sailings_cruise_departure" ON "cruise_sailings" USING btree ("cruise_id","departure_date");--> statement-breakpoint
CREATE INDEX "idx_cruise_sailings_ship_departure" ON "cruise_sailings" USING btree ("ship_id","departure_date");--> statement-breakpoint
CREATE INDEX "idx_cruise_sailings_status_departure" ON "cruise_sailings" USING btree ("sales_status","departure_date");--> statement-breakpoint
CREATE INDEX "idx_cruise_sailings_embark_place" ON "cruise_sailings" USING btree ("embark_port_canonical_place_id");--> statement-breakpoint
CREATE INDEX "idx_cruise_sailings_disembark_place" ON "cruise_sailings" USING btree ("disembark_port_canonical_place_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_cruise_sailings_cruise_date_ship" ON "cruise_sailings" USING btree ("cruise_id","departure_date","ship_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_cruise_voyage_segments_group_sort" ON "cruise_voyage_group_segments" USING btree ("voyage_group_id","sort_order");--> statement-breakpoint
CREATE INDEX "idx_cruise_voyage_segments_group_role" ON "cruise_voyage_group_segments" USING btree ("voyage_group_id","segment_role");--> statement-breakpoint
CREATE INDEX "idx_cruise_voyage_segments_cruise" ON "cruise_voyage_group_segments" USING btree ("cruise_id");--> statement-breakpoint
CREATE INDEX "idx_cruise_voyage_segments_sailing" ON "cruise_voyage_group_segments" USING btree ("sailing_id");--> statement-breakpoint
CREATE INDEX "idx_cruise_voyage_segments_embark_place" ON "cruise_voyage_group_segments" USING btree ("embark_port_canonical_place_id");--> statement-breakpoint
CREATE INDEX "idx_cruise_voyage_segments_disembark_place" ON "cruise_voyage_group_segments" USING btree ("disembark_port_canonical_place_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_cruise_voyage_groups_slug" ON "cruise_voyage_groups" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_cruise_voyage_groups_kind_status" ON "cruise_voyage_groups" USING btree ("group_kind","status");--> statement-breakpoint
CREATE INDEX "idx_cruise_voyage_groups_supplier_status" ON "cruise_voyage_groups" USING btree ("line_supplier_id","status");--> statement-breakpoint
CREATE INDEX "idx_cruise_voyage_groups_embark_place" ON "cruise_voyage_groups" USING btree ("embark_port_canonical_place_id");--> statement-breakpoint
CREATE INDEX "idx_cruise_voyage_groups_disembark_place" ON "cruise_voyage_groups" USING btree ("disembark_port_canonical_place_id");--> statement-breakpoint
CREATE INDEX "idx_cruise_voyage_groups_earliest_status" ON "cruise_voyage_groups" USING btree ("earliest_departure_cached","status");--> statement-breakpoint
CREATE INDEX "idx_cruise_voyage_groups_status_created" ON "cruise_voyage_groups" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_cruises_slug" ON "cruises" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_cruises_type_status" ON "cruises" USING btree ("cruise_type","status");--> statement-breakpoint
CREATE INDEX "idx_cruises_supplier_status" ON "cruises" USING btree ("line_supplier_id","status");--> statement-breakpoint
CREATE INDEX "idx_cruises_embark_place" ON "cruises" USING btree ("embark_port_canonical_place_id");--> statement-breakpoint
CREATE INDEX "idx_cruises_disembark_place" ON "cruises" USING btree ("disembark_port_canonical_place_id");--> statement-breakpoint
CREATE INDEX "idx_cruises_region_ids_gin" ON "cruises" USING gin ("region_ids");--> statement-breakpoint
CREATE INDEX "idx_cruises_waterway_ids_gin" ON "cruises" USING gin ("waterway_ids");--> statement-breakpoint
CREATE INDEX "idx_cruises_port_ids_gin" ON "cruises" USING gin ("port_ids");--> statement-breakpoint
CREATE INDEX "idx_cruises_country_iso_gin" ON "cruises" USING gin ("country_iso");--> statement-breakpoint
CREATE INDEX "idx_cruises_waterways_gin" ON "cruises" USING gin ("waterways");--> statement-breakpoint
CREATE INDEX "idx_cruises_ports_gin" ON "cruises" USING gin ("ports");--> statement-breakpoint
CREATE INDEX "idx_cruises_countries_gin" ON "cruises" USING gin ("countries");--> statement-breakpoint
CREATE INDEX "idx_cruises_earliest_departure_status" ON "cruises" USING btree ("earliest_departure_cached","status");--> statement-breakpoint
CREATE INDEX "idx_cruises_status_created" ON "cruises" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_cruise_days_cruise_day" ON "cruise_days" USING btree ("cruise_id","day_number");--> statement-breakpoint
CREATE INDEX "idx_cruise_days_cruise" ON "cruise_days" USING btree ("cruise_id");--> statement-breakpoint
CREATE INDEX "idx_cruise_days_port_place" ON "cruise_days" USING btree ("port_canonical_place_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_cruise_sailing_days_sailing_day" ON "cruise_sailing_days" USING btree ("sailing_id","day_number");--> statement-breakpoint
CREATE INDEX "idx_cruise_sailing_days_sailing" ON "cruise_sailing_days" USING btree ("sailing_id");--> statement-breakpoint
CREATE INDEX "idx_cruise_sailing_days_port_place" ON "cruise_sailing_days" USING btree ("port_canonical_place_id");--> statement-breakpoint
CREATE INDEX "idx_cruise_price_components_price" ON "cruise_price_components" USING btree ("price_id");--> statement-breakpoint
CREATE INDEX "idx_cruise_price_components_price_kind" ON "cruise_price_components" USING btree ("price_id","kind");--> statement-breakpoint
CREATE INDEX "idx_cruise_prices_lookup" ON "cruise_prices" USING btree ("sailing_id","cabin_category_id","occupancy","fare_code","fare_variant");--> statement-breakpoint
CREATE INDEX "idx_cruise_prices_lowest" ON "cruise_prices" USING btree ("sailing_id","availability","price_per_person");--> statement-breakpoint
CREATE INDEX "idx_cruise_prices_catalog" ON "cruise_prices" USING btree ("price_catalog_id");--> statement-breakpoint
CREATE INDEX "idx_cruise_prices_schedule" ON "cruise_prices" USING btree ("price_schedule_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_cruise_prices_standing" ON "cruise_prices" USING btree ("sailing_id","cabin_category_id","occupancy","fare_code","fare_variant") WHERE "cruise_prices"."price_schedule_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_cruise_search_index_slug" ON "cruise_search_index" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_cruise_search_index_source_refreshed" ON "cruise_search_index" USING btree ("source","refreshed_at");--> statement-breakpoint
CREATE INDEX "idx_cruise_search_index_type_price" ON "cruise_search_index" USING btree ("cruise_type","lowest_price_cents");--> statement-breakpoint
CREATE INDEX "idx_cruise_search_index_earliest_departure" ON "cruise_search_index" USING btree ("earliest_departure");--> statement-breakpoint
CREATE INDEX "idx_cruise_search_index_latest_departure" ON "cruise_search_index" USING btree ("latest_departure");--> statement-breakpoint
CREATE INDEX "idx_cruise_search_index_embark_place" ON "cruise_search_index" USING btree ("embark_port_canonical_place_id");--> statement-breakpoint
CREATE INDEX "idx_cruise_search_index_disembark_place" ON "cruise_search_index" USING btree ("disembark_port_canonical_place_id");--> statement-breakpoint
CREATE INDEX "idx_cruise_search_index_region_ids_gin" ON "cruise_search_index" USING gin ("region_ids");--> statement-breakpoint
CREATE INDEX "idx_cruise_search_index_waterway_ids_gin" ON "cruise_search_index" USING gin ("waterway_ids");--> statement-breakpoint
CREATE INDEX "idx_cruise_search_index_port_ids_gin" ON "cruise_search_index" USING gin ("port_ids");--> statement-breakpoint
CREATE INDEX "idx_cruise_search_index_country_iso_gin" ON "cruise_search_index" USING gin ("country_iso");--> statement-breakpoint
CREATE INDEX "idx_cruise_search_index_regions_gin" ON "cruise_search_index" USING gin ("regions");--> statement-breakpoint
CREATE INDEX "idx_cruise_search_index_waterways_gin" ON "cruise_search_index" USING gin ("waterways");--> statement-breakpoint
CREATE INDEX "idx_cruise_search_index_ports_gin" ON "cruise_search_index" USING gin ("ports");--> statement-breakpoint
CREATE INDEX "idx_cruise_search_index_countries_gin" ON "cruise_search_index" USING gin ("countries");--> statement-breakpoint
CREATE INDEX "idx_cruise_search_index_themes_gin" ON "cruise_search_index" USING gin ("themes");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_cruise_search_index_external" ON "cruise_search_index" USING btree ("source_provider","source_ref") WHERE "cruise_search_index"."source" = 'external';--> statement-breakpoint
DO $$
DECLARE
  seeded_pipeline_id text := 'pipe_01kyy55np3ezq9kve9v2d99dbp';
BEGIN
  IF EXISTS (SELECT 1 FROM "pipelines" WHERE "entity_type" = 'proposal') THEN
    RETURN;
  END IF;

  INSERT INTO "pipelines" ("id", "entity_type", "name", "is_default", "sort_order")
  VALUES (seeded_pipeline_id, 'proposal', 'Sales', true, 0);

  INSERT INTO "stages"
    ("id", "pipeline_id", "name", "sort_order", "probability", "is_closed", "is_won", "is_lost")
  VALUES
    ('stg_01kyy55np4e8dr6dgbsj5xvba3', seeded_pipeline_id, 'New Inquiry', 0, 10, false, false, false),
    ('stg_01kyy55np4e8dr6dgcfwfbg464', seeded_pipeline_id, 'Qualified', 1, 25, false, false, false),
    ('stg_01kyy55np4e8dr6dgjp6j29d23', seeded_pipeline_id, 'Proposal Sent', 2, 50, false, false, false),
    ('stg_01kyy55np4e8dr6dgp4evy8xdx', seeded_pipeline_id, 'Negotiation', 3, 75, false, false, false),
    ('stg_01kyy55np4e8dr6dgvkpdkvn9y', seeded_pipeline_id, 'Won', 4, 100, true, true, false),
    ('stg_01kyy55np4e8dr6dgwer94cgpx', seeded_pipeline_id, 'Lost', 5, 0, true, false, true);
END $$;
