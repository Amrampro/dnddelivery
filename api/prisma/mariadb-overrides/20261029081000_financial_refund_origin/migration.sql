-- Documentary refunds from the courier or funds already received by the agency.
-- This is an audit of external operations; no electronic transfer is performed.
ALTER TABLE FinancialCorrection
  DROP CONSTRAINT chk_fin_correction_target,
  ADD CONSTRAINT chk_fin_correction_target CHECK (
    (kind IN ('EXPECTED','EXCEPTION') AND collectionId IS NULL AND remittanceItemId IS NULL)
    OR (kind IN ('COLLECTION','REFUND','AGENCY_REFUND') AND collectionId IS NOT NULL AND remittanceItemId IS NULL)
    OR (kind='RECEIPT' AND collectionId IS NOT NULL AND remittanceItemId IS NOT NULL)
  );
