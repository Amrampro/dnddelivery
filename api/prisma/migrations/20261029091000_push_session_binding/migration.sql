ALTER TABLE UserDevice ADD COLUMN sessionFamilyId CHAR(36) NULL;
CREATE INDEX UserDevice_userId_sessionFamilyId_idx ON UserDevice(userId,sessionFamilyId);
