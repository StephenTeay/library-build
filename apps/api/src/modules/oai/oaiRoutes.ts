import { Router, Request, Response } from 'express';
import { pool } from '../../db/pool.js';

export const oaiRouter = Router();

function escapeXml(unsafe: string | null | undefined): string {
  if (!unsafe) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wrapOaiResponse(verb: string, reqUrl: string, content: string, isError = false): string {
  const timestamp = new Date().toISOString();
  return `<?xml version="1.0" encoding="UTF-8"?>
<OAI-PMH xmlns="http://www.openarchives.org/OAI/2.0/"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://www.openarchives.org/OAI/2.0/ http://www.openarchives.org/OAI/2.0/OAI-PMH.xsd">
  <responseDate>${timestamp}</responseDate>
  <request${verb ? ` verb="${escapeXml(verb)}"` : ''}>${escapeXml(reqUrl)}</request>
  ${content}
</OAI-PMH>`;
}

oaiRouter.get('/', async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/xml; charset=utf-8');
  const verb = req.query.verb as string | undefined;
  const baseUrl = `${req.protocol}://${req.get('host')}/api/oai`;

  if (!verb) {
    const errorXml = `<error code="badVerb">Missing required verb parameter.</error>`;
    res.status(400).send(wrapOaiResponse('', baseUrl, errorXml, true));
    return;
  }

  try {
    switch (verb) {
      case 'Identify': {
        const payload = `
  <Identify>
    <repositoryName>Federal School of Statistics, Ibadan Institutional Repository</repositoryName>
    <baseURL>${escapeXml(baseUrl)}</baseURL>
    <protocolVersion>2.0</protocolVersion>
    <adminEmail>library@fss.ng</adminEmail>
    <earliestDatestamp>2020-01-01T00:00:00Z</earliestDatestamp>
    <deletedRecord>no</deletedRecord>
    <granularity>YYYY-MM-DDThh:mm:ssZ</granularity>
  </Identify>`;
        res.status(200).send(wrapOaiResponse(verb, baseUrl, payload));
        return;
      }

      case 'ListMetadataFormats': {
        const payload = `
  <ListMetadataFormats>
    <metadataFormat>
      <metadataPrefix>oai_dc</metadataPrefix>
      <schema>http://www.openarchives.org/OAI/2.0/oai_dc.xsd</schema>
      <metadataNamespace>http://www.openarchives.org/OAI/2.0/oai_dc/</metadataNamespace>
    </metadataFormat>
  </ListMetadataFormats>`;
        res.status(200).send(wrapOaiResponse(verb, baseUrl, payload));
        return;
      }

      case 'ListSets': {
        const payload = `
  <ListSets>
    <set>
      <setSpec>theses</setSpec>
      <setName>Theses and Dissertations</setName>
    </set>
    <set>
      <setSpec>nd</setSpec>
      <setName>National Diploma Projects</setName>
    </set>
    <set>
      <setSpec>hnd</setSpec>
      <setName>Higher National Diploma Theses</setName>
    </set>
  </ListSets>`;
        res.status(200).send(wrapOaiResponse(verb, baseUrl, payload));
        return;
      }

      case 'ListIdentifiers': {
        const metadataPrefix = req.query.metadataPrefix as string | undefined;
        if (!metadataPrefix) {
          const err = `<error code="badArgument">metadataPrefix is a required argument for ListIdentifiers.</error>`;
          res.status(400).send(wrapOaiResponse(verb, baseUrl, err, true));
          return;
        }
        if (metadataPrefix !== 'oai_dc') {
          const err = `<error code="cannotDisseminateFormat">metadataPrefix '${escapeXml(metadataPrefix)}' is not supported.</error>`;
          res.status(400).send(wrapOaiResponse(verb, baseUrl, err, true));
          return;
        }

        const { rows } = await pool.query(
          `SELECT id, published_at, created_at, programme 
           FROM theses_repository 
           WHERE status = 'PUBLISHED' 
           ORDER BY published_at DESC LIMIT 100;`
        );

        if (rows.length === 0) {
          const err = `<error code="noRecordsMatch">No published theses found in repository.</error>`;
          res.status(200).send(wrapOaiResponse(verb, baseUrl, err, true));
          return;
        }

        let idHeaders = '<ListIdentifiers>\n';
        for (const row of rows) {
          const datestamp = new Date(row.published_at || row.created_at).toISOString();
          idHeaders += `    <header>
      <identifier>oai:fss.ng:theses/${row.id}</identifier>
      <datestamp>${datestamp}</datestamp>
      <setSpec>theses</setSpec>
      <setSpec>${(row.programme || 'ND').toLowerCase()}</setSpec>
    </header>\n`;
        }
        idHeaders += '  </ListIdentifiers>';
        res.status(200).send(wrapOaiResponse(verb, baseUrl, idHeaders));
        return;
      }

      case 'ListRecords': {
        const metadataPrefix = req.query.metadataPrefix as string | undefined;
        if (!metadataPrefix) {
          const err = `<error code="badArgument">metadataPrefix is a required argument for ListRecords.</error>`;
          res.status(400).send(wrapOaiResponse(verb, baseUrl, err, true));
          return;
        }
        if (metadataPrefix !== 'oai_dc') {
          const err = `<error code="cannotDisseminateFormat">metadataPrefix '${escapeXml(metadataPrefix)}' is not supported.</error>`;
          res.status(400).send(wrapOaiResponse(verb, baseUrl, err, true));
          return;
        }

        const { rows } = await pool.query(
          `SELECT t.id, t.title, t.abstract, t.student_authors, t.supervisor_name, t.programme,
                  t.academic_session, t.status, t.published_at, t.created_at,
                  d.name as department_name, d.code as department_code
           FROM theses_repository t
           LEFT JOIN departments d ON t.department_id = d.id
           WHERE t.status = 'PUBLISHED'
           ORDER BY t.published_at DESC LIMIT 100;`
        );

        if (rows.length === 0) {
          const err = `<error code="noRecordsMatch">No records match the requested harvest query.</error>`;
          res.status(200).send(wrapOaiResponse(verb, baseUrl, err, true));
          return;
        }

        let recordXml = '<ListRecords>\n';
        for (const row of rows) {
          const datestamp = new Date(row.published_at || row.created_at).toISOString();
          const authorName = Array.isArray(row.student_authors) && row.student_authors.length > 0 && row.student_authors[0].name
            ? row.student_authors[0].name
            : 'FSS Student Researcher';

          recordXml += `    <record>
      <header>
        <identifier>oai:fss.ng:theses/${row.id}</identifier>
        <datestamp>${datestamp}</datestamp>
        <setSpec>theses</setSpec>
        <setSpec>${(row.programme || 'ND').toLowerCase()}</setSpec>
      </header>
      <metadata>
        <oai_dc:dc xmlns:oai_dc="http://www.openarchives.org/OAI/2.0/oai_dc/"
                   xmlns:dc="http://purl.org/dc/elements/1.1/"
                   xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                   xsi:schemaLocation="http://www.openarchives.org/OAI/2.0/oai_dc/ http://www.openarchives.org/OAI/2.0/oai_dc.xsd">
          <dc:title>${escapeXml(row.title)}</dc:title>
          <dc:creator>${escapeXml(authorName)}</dc:creator>
          <dc:subject>${escapeXml(row.department_name || 'Statistics')}</dc:subject>
          <dc:description>${escapeXml(row.abstract)}</dc:description>
          <dc:publisher>Federal School of Statistics, Ibadan</dc:publisher>
          <dc:contributor>${escapeXml(row.supervisor_name || 'Academic Supervisor')}</dc:contributor>
          <dc:date>${row.academic_session || new Date(row.created_at).getFullYear()}</dc:date>
          <dc:type>Text / Thesis</dc:type>
          <dc:format>application/pdf</dc:format>
          <dc:identifier>${escapeXml(baseUrl)}/theses/${row.id}</dc:identifier>
          <dc:language>en</dc:language>
          <dc:rights>Open Access under institutional academic terms</dc:rights>
        </oai_dc:dc>
      </metadata>
    </record>\n`;
        }
        recordXml += '  </ListRecords>';
        res.status(200).send(wrapOaiResponse(verb, baseUrl, recordXml));
        return;
      }

      case 'GetRecord': {
        const identifier = req.query.identifier as string | undefined;
        const metadataPrefix = req.query.metadataPrefix as string | undefined;

        if (!identifier || !metadataPrefix) {
          const err = `<error code="badArgument">identifier and metadataPrefix are both required.</error>`;
          res.status(400).send(wrapOaiResponse(verb, baseUrl, err, true));
          return;
        }
        if (metadataPrefix !== 'oai_dc') {
          const err = `<error code="cannotDisseminateFormat">metadataPrefix '${escapeXml(metadataPrefix)}' is not supported.</error>`;
          res.status(400).send(wrapOaiResponse(verb, baseUrl, err, true));
          return;
        }

        // Identifier may be oai:fss.ng:theses/<uuid> or just <uuid>
        const uuidMatch = identifier.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
        const uuid = uuidMatch ? uuidMatch[0] : null;

        if (!uuid) {
          const err = `<error code="idDoesNotExist">The value of identifier '${escapeXml(identifier)}' is illegal.</error>`;
          res.status(404).send(wrapOaiResponse(verb, baseUrl, err, true));
          return;
        }

        const { rows } = await pool.query(
          `SELECT t.id, t.title, t.abstract, t.student_authors, t.supervisor_name, t.programme,
                  t.academic_session, t.status, t.published_at, t.created_at,
                  d.name as department_name, d.code as department_code
           FROM theses_repository t
           LEFT JOIN departments d ON t.department_id = d.id
           WHERE t.id = $1 AND t.status = 'PUBLISHED';`,
          [uuid]
        );

        if (rows.length === 0) {
          const err = `<error code="idDoesNotExist">No published record with identifier '${escapeXml(identifier)}'.</error>`;
          res.status(404).send(wrapOaiResponse(verb, baseUrl, err, true));
          return;
        }

        const row = rows[0];
        const datestamp = new Date(row.published_at || row.created_at).toISOString();
        const authorName = Array.isArray(row.student_authors) && row.student_authors.length > 0 && row.student_authors[0].name
          ? row.student_authors[0].name
          : 'FSS Student Researcher';

        const recordXml = `
  <GetRecord>
    <record>
      <header>
        <identifier>oai:fss.ng:theses/${row.id}</identifier>
        <datestamp>${datestamp}</datestamp>
        <setSpec>theses</setSpec>
        <setSpec>${(row.programme || 'ND').toLowerCase()}</setSpec>
      </header>
      <metadata>
        <oai_dc:dc xmlns:oai_dc="http://www.openarchives.org/OAI/2.0/oai_dc/"
                   xmlns:dc="http://purl.org/dc/elements/1.1/"
                   xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                   xsi:schemaLocation="http://www.openarchives.org/OAI/2.0/oai_dc/ http://www.openarchives.org/OAI/2.0/oai_dc.xsd">
          <dc:title>${escapeXml(row.title)}</dc:title>
          <dc:creator>${escapeXml(authorName)}</dc:creator>
          <dc:subject>${escapeXml(row.department_name || 'Statistics')}</dc:subject>
          <dc:description>${escapeXml(row.abstract)}</dc:description>
          <dc:publisher>Federal School of Statistics, Ibadan</dc:publisher>
          <dc:contributor>${escapeXml(row.supervisor_name || 'Academic Supervisor')}</dc:contributor>
          <dc:date>${row.academic_session || new Date(row.created_at).getFullYear()}</dc:date>
          <dc:type>Text / Thesis</dc:type>
          <dc:format>application/pdf</dc:format>
          <dc:identifier>${escapeXml(baseUrl)}/theses/${row.id}</dc:identifier>
          <dc:language>en</dc:language>
          <dc:rights>Open Access under institutional academic terms</dc:rights>
        </oai_dc:dc>
      </metadata>
    </record>
  </GetRecord>`;

        res.status(200).send(wrapOaiResponse(verb, baseUrl, recordXml));
        return;
      }

      default: {
        const err = `<error code="badVerb">Value of the verb argument '${escapeXml(verb)}' is not a legal OAI-PMH verb.</error>`;
        res.status(400).send(wrapOaiResponse(verb, baseUrl, err, true));
        return;
      }
    }
  } catch (err: any) {
    const errorXml = `<error code="internalError">${escapeXml(err.message)}</error>`;
    res.status(500).send(wrapOaiResponse(verb || '', baseUrl, errorXml, true));
  }
});
