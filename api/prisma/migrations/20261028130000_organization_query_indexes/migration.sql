CREATE INDEX Agency_company_name_idx ON Agency(companyId,name,id);
CREATE INDEX CompanyMembership_organization_idx ON CompanyMembership(companyId,organizationRole,employmentStatus);
CREATE INDEX CompanyInvitation_kind_created_idx ON CompanyInvitation(companyId,kind,createdAt,id);
-- Only replace machine-code placeholder labels; never overwrite customized role names.
UPDATE Role SET name='Employé entreprise' WHERE code='company_member' AND name=code;
UPDATE Role SET name='Responsable agence' WHERE code='agency_manager' AND name=code;
UPDATE Role SET name='Gestionnaire stock' WHERE code='stock_manager' AND name=code;
UPDATE Role SET name='Livreur' WHERE code='courier' AND name=code;
UPDATE Role SET name='Employé agence' WHERE code='agency_employee' AND name=code;
