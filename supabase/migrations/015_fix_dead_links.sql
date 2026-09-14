-- ============================================================
-- Migration: 015_fix_dead_links.sql
-- Description: application links that no longer resolve.
--
-- Checked 15 Sep 2026 from a real browser. Six domains return
-- NXDOMAIN on public DNS (the portals moved); each gets the current
-- official site, verified to open. TReDS is removed: its site is gone
-- and invoice discounting is not something a village shop can use.
-- enam.gov.in and mca.gov.in answer 403 to scripts but open for people;
-- aajeevika.gov.in is slow but up. Those are left alone.
-- ============================================================

UPDATE public.schemes SET application_link = 'https://wcd.gov.in/'                   WHERE id = 'wdc-mahila';       -- wcd.nic.in
UPDATE public.schemes SET application_link = 'https://www.kvic.gov.in/'               WHERE id = 'pmegp';            -- kviconline.gov.in
UPDATE public.schemes SET application_link = 'https://pmkisan.gov.in/'                WHERE id = 'agriculture-kcc';  -- agricoop.nic.in (KCC form lives on the PM-Kisan portal)
UPDATE public.schemes SET application_link = 'https://www.skillindiadigital.gov.in/'  WHERE id = 'pmkvy';            -- pmkvyofficial.org
UPDATE public.schemes SET application_link = 'https://www.cgtmse.in/'                 WHERE id = 'cgtmse-hybrid';    -- pcg.cgtmse.in

DELETE FROM public.schemes WHERE id = 'treds';                                                                       -- tradereceivables.in

DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM public.schemes WHERE id = 'treds';
  IF n > 0 THEN RAISE EXCEPTION 'treds still present'; END IF;
  RAISE NOTICE 'links updated; schemes now: %', (SELECT count(*) FROM public.schemes);
END $$;
