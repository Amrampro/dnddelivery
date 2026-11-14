ALTER TABLE ParcelLeg ADD COLUMN receivedAgencyId CHAR(36) NULL,ADD COLUMN returnedToOrigin BOOLEAN NOT NULL DEFAULT false;
UPDATE ParcelLeg SET receivedAgencyId=destinationAgencyId WHERE status='RECEIVED';
ALTER TABLE ParcelLeg ADD CONSTRAINT ParcelLeg_received_agency_fk FOREIGN KEY(companyId,receivedAgencyId) REFERENCES Agency(companyId,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE ParcelLeg ADD CONSTRAINT chk_parcel_receipt_location CHECK(status<>'RECEIVED' OR (receivedAgencyId IS NOT NULL AND ((returnedToOrigin=false AND receivedAgencyId=destinationAgencyId) OR (returnedToOrigin=true AND receivedAgencyId=originAgencyId))));
