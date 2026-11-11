-- The analytics baseline already uses this reserved supplier for non-purchase stock.
INSERT INTO fournisseurs(id,code,nom,is_active) VALUES('00000000-0000-0000-0000-000000000001','APMS-OPENING','Stock d’ouverture',false) ON CONFLICT(id) DO NOTHING;
