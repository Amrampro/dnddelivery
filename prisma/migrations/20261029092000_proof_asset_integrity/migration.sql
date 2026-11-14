ALTER TABLE OtpException ADD CONSTRAINT otp_exception_approver_member_fk FOREIGN KEY(companyId,decidedById) REFERENCES CompanyMembership(companyId,userId) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE OtpException ADD CONSTRAINT otp_exception_requester_member_fk FOREIGN KEY(companyId,requestedById) REFERENCES CompanyMembership(companyId,userId) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE DeliveryOtp ADD CONSTRAINT otp_verifier_member_fk FOREIGN KEY(companyId,verifiedById) REFERENCES CompanyMembership(companyId,userId) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE DeliveryProof ADD CONSTRAINT proof_confirmer_member_fk FOREIGN KEY(companyId,confirmedById) REFERENCES CompanyMembership(companyId,userId) ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE TRIGGER FileAsset_preserve_evidence BEFORE UPDATE ON FileAsset FOR EACH ROW
BEGIN
 IF EXISTS(SELECT 1 FROM DeliveryEvidence WHERE companyId=OLD.companyId AND fileId=OLD.id) AND NOT(OLD.companyId<=>NEW.companyId AND OLD.storageKey<=>NEW.storageKey AND OLD.mimeType<=>NEW.mimeType AND OLD.sizeBytes<=>NEW.sizeBytes AND OLD.checksumSha256<=>NEW.checksumSha256 AND OLD.uploadedById<=>NEW.uploadedById AND OLD.visibility<=>NEW.visibility AND OLD.archivedAt<=>NEW.archivedAt AND OLD.createdAt<=>NEW.createdAt) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Evidence file metadata is immutable'; END IF;
END;
CREATE TRIGGER ProofPhoto_immutable_update BEFORE UPDATE ON ProofPhoto FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Final proof photo links are immutable';
CREATE TRIGGER ProofPhoto_immutable_delete BEFORE DELETE ON ProofPhoto FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Final proof photo links must be preserved';
