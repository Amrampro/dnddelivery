ALTER TABLE DeliveryEvidence DROP CHECK chk_evidence_status,
ADD CONSTRAINT chk_evidence_status CHECK ((status IN ('READY','RETIRED') AND proofId IS NULL) OR (status='ATTACHED' AND proofId IS NOT NULL));
DROP TRIGGER Evidence_preserve_source;
CREATE TRIGGER Evidence_preserve_source BEFORE UPDATE ON DeliveryEvidence FOR EACH ROW
BEGIN
 IF OLD.status<>'READY' OR NEW.status NOT IN ('READY','ATTACHED','RETIRED') OR NOT(OLD.companyId<=>NEW.companyId AND OLD.deliveryId<=>NEW.deliveryId AND OLD.agencyId<=>NEW.agencyId AND OLD.courierId<=>NEW.courierId AND OLD.assignmentId<=>NEW.assignmentId AND OLD.fileId<=>NEW.fileId AND OLD.kind<=>NEW.kind AND OLD.operationKey<=>NEW.operationKey AND OLD.requestHash<=>NEW.requestHash AND OLD.createdAt<=>NEW.createdAt) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Evidence source and terminal state are immutable'; END IF;
END;
