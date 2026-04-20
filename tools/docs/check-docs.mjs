import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const docsDir = path.resolve('docs');
const indexPath = path.join(docsDir, 'index.md');
const deferredFollowupsPath = path.join(docsDir, 'runbooks/deferred-followups.md');

const featureStatuses = new Set([
  'Not Started',
  'In Progress',
  'In Review',
  'Completed',
  'Cancelled',
]);

const epicStatuses = new Set(['Planned', 'In Progress', 'Completed', 'Cancelled']);
const adrStatusPattern =
  /^(Proposed|Accepted|Deprecated|Superseded by ADR-\d{4}(?:-[a-z0-9-]+)?)$/;

const errors = [];

const featureRelationshipGroups = [
  {
    title: 'Parent Epic',
    prefixes: ['epics/'],
    allowNone: false,
    minLinks: 1,
    maxLinks: 1,
  },
  {
    title: 'Related Feature PRDs',
    prefixes: ['features/'],
    allowNone: true,
    minLinks: 1,
  },
  {
    title: 'Related ADRs',
    prefixes: ['adrs/'],
    allowNone: true,
    minLinks: 1,
  },
  {
    title: 'Related Architecture Docs',
    prefixes: ['architecture/'],
    allowNone: true,
    minLinks: 1,
  },
];

const epicRelationshipGroups = [
  {
    title: 'Product and Architecture Docs',
    prefixes: ['product/', 'architecture/', 'runbooks/'],
    allowNone: false,
    minLinks: 1,
  },
  {
    title: 'Related Epics and Cross-PRD Dependencies',
    prefixes: ['epics/', 'features/'],
    allowNone: true,
    minLinks: 1,
  },
  {
    title: 'Related ADRs',
    prefixes: ['adrs/'],
    allowNone: true,
    minLinks: 1,
  },
  {
    title: 'Feature Breakdown',
    prefixes: ['features/'],
    allowNone: true,
    minLinks: 1,
  },
];

const adrRelationshipGroups = [
  {
    title: 'Related Epics',
    prefixes: ['epics/'],
    allowNone: true,
    minLinks: 1,
  },
  {
    title: 'Related Feature PRDs',
    prefixes: ['features/'],
    allowNone: true,
    minLinks: 1,
  },
  {
    title: 'Related Architecture Docs',
    prefixes: ['architecture/'],
    allowNone: true,
    minLinks: 1,
  },
];

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function walkMarkdownFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkMarkdownFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(fullPath);
    }
  }
  return files;
}

function getScopedDocFiles(kind) {
  const dir = path.join(docsDir, kind);
  const prefix = kind === 'features' ? 'FEAT' : kind === 'epics' ? 'EPIC' : 'ADR';
  return walkMarkdownFiles(dir)
    .map((absolutePath) => toPosix(path.relative(docsDir, absolutePath)))
    .filter(
      (relativePath) =>
        relativePath.startsWith(`${kind}/${prefix}-`) && !relativePath.includes('/_template.md'),
    );
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getTableFieldValue(markdown, fieldName) {
  const matcher = new RegExp(
    `^\\|\\s*\\*\\*${escapeRegex(fieldName)}\\*\\*\\s*\\|\\s*([^|]+?)\\s*\\|$`,
    'm',
  );
  const match = markdown.match(matcher);
  return match ? match[1].trim() : null;
}

function getTableField(markdown, fieldName, filePath) {
  const value = getTableFieldValue(markdown, fieldName);
  if (value !== null) {
    return value;
  }

  const matcher = new RegExp(
    `^\\|\\s*\\*\\*${escapeRegex(fieldName)}\\*\\*\\s*\\|\\s*([^|]+?)\\s*\\|$`,
    'm',
  );
  const match = markdown.match(matcher);
  if (!match) {
    errors.push(`${filePath}: missing table field **${fieldName}**`);
    return null;
  }
  return match[1].trim();
}

function getSection(markdown, heading, filePath) {
  const matcher = new RegExp(
    `^## ${escapeRegex(heading)}\\s*$([\\s\\S]*?)(?=^## |(?![\\s\\S]))`,
    'm',
  );
  const match = markdown.match(matcher);
  if (!match) {
    errors.push(`${filePath}: missing "## ${heading}" section`);
    return null;
  }
  return match[1];
}

function normalizeDocLink(docPath, rawTarget) {
  const posixTarget = rawTarget.replace(/\\/g, '/');
  return path.posix.normalize(path.posix.join(path.posix.dirname(docPath), posixTarget));
}

function getDocLinks(docPath, markdown) {
  return Array.from(markdown.matchAll(/\[[^\]]+\]\(([^)]+\.md)\)/g), (match) =>
    normalizeDocLink(docPath, match[1].trim()),
  );
}

function hasExactNoneDeclaration(markdown) {
  return markdown.trim() === 'None.';
}

function hasAnyNoneDeclaration(markdown) {
  return /(^|<br\s*\/?>|\s)None\.(?=$|<br\s*\/?>|\s)/i.test(markdown.trim());
}

function validateLinkTargets(filePath, links, allowedPrefixes, docsSet, groupTitle) {
  for (const link of links) {
    if (!allowedPrefixes.some((prefix) => link.startsWith(prefix))) {
      errors.push(
        `${filePath}: "${groupTitle}" contains invalid link '${link}' (expected ${allowedPrefixes.join(' or ')})`,
      );
      continue;
    }

    if (!docsSet.has(link)) {
      errors.push(`${filePath}: "${groupTitle}" links missing doc '${link}'`);
    }
  }
}

function validateTableLinkGroup(filePath, markdown, group, docsSet) {
  const content = getTableField(markdown, group.title, filePath);
  if (content === null) {
    return [];
  }

  const links = getDocLinks(filePath, content);
  const hasExactNone = hasExactNoneDeclaration(content);
  const hasAnyNone = hasAnyNoneDeclaration(content);

  if (hasAnyNone && links.length > 0) {
    errors.push(`${filePath}: "${group.title}" cannot mix doc links with 'None.'`);
    return [];
  }

  if (hasExactNone) {
    if (!group.allowNone) {
      errors.push(`${filePath}: "${group.title}" requires linked docs and cannot be 'None.'`);
    }
    return [];
  }

  if (links.length < (group.minLinks ?? 1)) {
    const fallback = group.allowNone ? "linked docs or 'None.'" : 'linked docs';
    errors.push(`${filePath}: "${group.title}" must contain ${fallback}`);
    return [];
  }

  if (group.maxLinks !== undefined && links.length > group.maxLinks) {
    errors.push(`${filePath}: "${group.title}" must contain exactly ${group.maxLinks} linked doc(s)`);
    return [];
  }

  validateLinkTargets(filePath, links, group.prefixes, docsSet, group.title);
  return links;
}

function validateFeatureRelatedDocs(docsSet) {
  const files = getScopedDocFiles('features');

  for (const relativePath of files) {
    const absolutePath = path.join(docsDir, relativePath);
    const markdown = readFileSync(absolutePath, 'utf8');

    for (const group of featureRelationshipGroups) {
      validateTableLinkGroup(relativePath, markdown, group, docsSet);
    }
  }
}

function validateEpicRelatedDocs(docsSet) {
  const files = getScopedDocFiles('epics');

  for (const relativePath of files) {
    const absolutePath = path.join(docsDir, relativePath);
    const markdown = readFileSync(absolutePath, 'utf8');

    for (const group of epicRelationshipGroups) {
      validateTableLinkGroup(relativePath, markdown, group, docsSet);
    }
  }
}

function validateAdrMetadataAndDocs(docsSet) {
  const files = getScopedDocFiles('adrs');

  for (const relativePath of files) {
    const absolutePath = path.join(docsDir, relativePath);
    const markdown = readFileSync(absolutePath, 'utf8');

    const status = getTableField(markdown, 'Status', relativePath);
    if (status !== null && !adrStatusPattern.test(status)) {
      errors.push(`${relativePath}: invalid ADR status '${status}'`);
    }

    getTableField(markdown, 'Date', relativePath);
    getTableField(markdown, 'Deciders', relativePath);

    for (const group of adrRelationshipGroups) {
      validateTableLinkGroup(relativePath, markdown, group, docsSet);
    }
  }
}

function getIdFromPath(docPath, prefix) {
  const match = docPath.match(new RegExp(`(${prefix}-\\d{4})`));
  return match ? match[1] : null;
}

function collectScopedDocStatuses(kind) {
  const files = getScopedDocFiles(kind);
  const result = new Map();

  for (const relativePath of files) {
    const absolutePath = path.join(docsDir, relativePath);
    const markdown = readFileSync(absolutePath, 'utf8');
    const id = getIdFromPath(relativePath, kind === 'features' ? 'FEAT' : 'EPIC');

    if (!id) {
      errors.push(`${relativePath}: unable to parse scoped id from filename`);
      continue;
    }

    const status = getTableField(markdown, 'Status', relativePath);
    if (!status) {
      continue;
    }

    if (kind === 'features') {
      const parentEpicField = getTableFieldValue(markdown, 'Parent Epic');
      const parentEpic = parentEpicField ? getDocLinks(relativePath, parentEpicField) : [];
      const epicPath = parentEpic[0];
      const epic = epicPath ? getIdFromPath(epicPath, 'EPIC') : null;
      if (!epic) {
        errors.push(`${relativePath}: "Parent Epic" must resolve to an EPIC-XXXX doc`);
        continue;
      }
      result.set(id, { status, epic, path: relativePath });
    } else {
      result.set(id, { status, path: relativePath });
    }
  }

  return result;
}

function collectDeferredFollowupsFromScopedDocs() {
  const items = [];
  const linePattern =
    /^- Deferred follow-up \[(DF-\d{4})\]:\s*(.+?)\s*\|\s*Owner:\s*(.+?)\s*\|\s*Trigger:\s*(.+?)\s*\|\s*Exit criteria:\s*(.+?)\s*$/;

  for (const kind of ['features', 'epics']) {
    const files = getScopedDocFiles(kind);
    for (const relativePath of files) {
      const absolutePath = path.join(docsDir, relativePath);
      const markdown = readFileSync(absolutePath, 'utf8');
      const lines = markdown.split('\n');
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        const trimmed = line.trim();
        if (!trimmed.startsWith('- Deferred follow-up')) {
          continue;
        }

        const match = trimmed.match(linePattern);
        if (!match) {
          errors.push(
            `${relativePath}:${index + 1}: invalid deferred follow-up format (expected '- Deferred follow-up [DF-XXXX]: ... | Owner: FEAT/EPIC-XXXX | Trigger: ... | Exit criteria: ...')`,
          );
          continue;
        }

        const owner = match[3].trim();
        if (!/^(FEAT|EPIC)-\d{4}$/.test(owner)) {
          errors.push(
            `${relativePath}:${index + 1}: invalid deferred follow-up owner '${owner}' (expected FEAT-XXXX or EPIC-XXXX)`,
          );
          continue;
        }

        items.push({
          id: match[1].trim(),
          path: relativePath,
        });
      }
    }
  }

  return items;
}

function collectDeferredFollowupsBacklog() {
  const backlogPath = toPosix(path.relative(docsDir, deferredFollowupsPath));
  let markdown = '';
  try {
    markdown = readFileSync(deferredFollowupsPath, 'utf8');
  } catch (error) {
    errors.push(`${backlogPath}: missing required backlog file for deferred follow-ups`);
    return new Map();
  }

  const linePattern =
    /^- \[(DF-\d{4})\]\s*(.+?)\s*\|\s*Owner:\s*(.+?)\s*\|\s*Trigger:\s*(.+?)\s*\|\s*Exit criteria:\s*(.+?)\s*\|\s*Sources:\s*(.+?)\s*$/;
  const result = new Map();
  const lines = markdown.split('\n');
  const normalizeSourcePath = (rawPath) => {
    const posixPath = rawPath.replace(/\\/g, '/');
    if (posixPath.startsWith('features/') || posixPath.startsWith('epics/')) {
      return posixPath;
    }
    return path.posix.normalize(path.posix.join(path.posix.dirname(backlogPath), posixPath));
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed.startsWith('- [DF-')) {
      continue;
    }

    const match = trimmed.match(linePattern);
    if (!match) {
      errors.push(
        `${backlogPath}:${index + 1}: invalid deferred backlog format (expected '- [DF-XXXX] ... | Owner: FEAT/EPIC-XXXX | Trigger: ... | Exit criteria: ... | Sources: [path](path)')`,
      );
      continue;
    }

    const id = match[1].trim();
    if (result.has(id)) {
      errors.push(`${backlogPath}:${index + 1}: duplicate deferred backlog id '${id}'`);
      continue;
    }

    const owner = match[3].trim();
    if (!/^(FEAT|EPIC)-\d{4}$/.test(owner)) {
      errors.push(
        `${backlogPath}:${index + 1}: invalid deferred backlog owner '${owner}' (expected FEAT-XXXX or EPIC-XXXX)`,
      );
      continue;
    }

    const sourceLinks = Array.from(
      match[6].matchAll(/\[[^\]]+\]\(([^)]+\.md)\)/g),
      (sourceMatch) => normalizeSourcePath(sourceMatch[1].trim()),
    );

    if (sourceLinks.length === 0) {
      errors.push(`${backlogPath}:${index + 1}: deferred backlog item '${id}' must list at least one source doc link`);
      continue;
    }

    result.set(id, {
      path: backlogPath,
      sources: new Set(sourceLinks),
    });
  }

  return result;
}

function validateDeferredFollowupTracking(deferredFromDocs, deferredBacklog) {
  const byId = new Map();
  for (const item of deferredFromDocs) {
    if (!byId.has(item.id)) {
      byId.set(item.id, new Set());
    }
    byId.get(item.id).add(item.path);
  }

  for (const item of deferredFromDocs) {
    const backlogEntry = deferredBacklog.get(item.id);
    if (!backlogEntry) {
      errors.push(
        `${item.path}: deferred follow-up '${item.id}' is missing from runbooks/deferred-followups.md`,
      );
      continue;
    }

    if (!backlogEntry.sources.has(item.path)) {
      errors.push(
        `${item.path}: deferred follow-up '${item.id}' must include this source in runbooks/deferred-followups.md`,
      );
    }
  }

  for (const [id, backlogEntry] of deferredBacklog.entries()) {
    const sourceDocs = byId.get(id);
    if (!sourceDocs) {
      errors.push(
        `${backlogEntry.path}: deferred follow-up '${id}' is not referenced by any feature/epic doc`,
      );
      continue;
    }

    for (const sourcePath of backlogEntry.sources) {
      if (!sourceDocs.has(sourcePath)) {
        errors.push(
          `${backlogEntry.path}: deferred follow-up '${id}' references source '${sourcePath}' that does not declare the same id`,
        );
      }
    }
  }
}

function validateStatusContracts(features, epics) {
  for (const [id, feature] of features.entries()) {
    if (!featureStatuses.has(feature.status)) {
      errors.push(`${feature.path}: invalid feature status '${feature.status}' for ${id}`);
    }
    if (!/^EPIC-\d{4}$/.test(feature.epic)) {
      errors.push(`${feature.path}: invalid epic reference '${feature.epic}' for ${id}`);
    }
  }

  for (const [id, epic] of epics.entries()) {
    if (!epicStatuses.has(epic.status)) {
      errors.push(`${epic.path}: invalid epic status '${epic.status}' for ${id}`);
    }
  }
}

function validateInventory(indexMarkdown) {
  const sectionMatch = indexMarkdown.match(/## Docs Inventory([\s\S]*)$/m);
  if (!sectionMatch) {
    errors.push('docs/index.md: missing "## Docs Inventory" section');
    return;
  }

  const inventorySection = sectionMatch[1];
  const inventoryLinks = new Set(
    Array.from(inventorySection.matchAll(/\[[^\]]+\]\(([^)]+\.md)\)/g), (match) => match[1].trim()),
  );

  const docsFiles = walkMarkdownFiles(docsDir)
    .map((absolutePath) => toPosix(path.relative(docsDir, absolutePath)))
    .filter((relativePath) => relativePath !== 'index.md');

  const docsSet = new Set(docsFiles);

  for (const docPath of docsSet) {
    if (!inventoryLinks.has(docPath)) {
      errors.push(`docs/index.md: docs inventory missing '${docPath}'`);
    }
  }

  for (const listedPath of inventoryLinks) {
    if (!docsSet.has(listedPath)) {
      errors.push(`docs/index.md: docs inventory lists missing file '${listedPath}'`);
    }
  }
}

function validateRollups(indexMarkdown, features, epics) {
  const indexEpics = new Map();
  const epicRowRegex = /^\|\s*(EPIC-\d{4})\s*\|\s*([^|]+?)\s*\|\s*\[[^\]]+\]\((epics\/[^)]+\.md)\)\s*\|$/gm;
  for (const match of indexMarkdown.matchAll(epicRowRegex)) {
    indexEpics.set(match[1], { status: match[2].trim(), path: match[3].trim() });
  }

  const indexFeatures = new Map();
  const featureRowRegex = /^\|\s*(FEAT-\d{4})\s*\|\s*(EPIC-\d{4})\s*\|\s*([^|]+?)\s*\|\s*\[[^\]]+\]\((features\/[^)]+\.md)\)\s*\|$/gm;
  for (const match of indexMarkdown.matchAll(featureRowRegex)) {
    indexFeatures.set(match[1], {
      epic: match[2].trim(),
      status: match[3].trim(),
      path: match[4].trim(),
    });
  }

  for (const [id, epic] of epics.entries()) {
    const row = indexEpics.get(id);
    if (!row) {
      errors.push(`docs/index.md: epic rollup missing '${id}'`);
      continue;
    }
    if (row.status !== epic.status) {
      errors.push(`docs/index.md: epic '${id}' status mismatch (index='${row.status}', doc='${epic.status}')`);
    }
    if (row.path !== epic.path) {
      errors.push(`docs/index.md: epic '${id}' path mismatch (index='${row.path}', doc='${epic.path}')`);
    }
  }

  for (const id of indexEpics.keys()) {
    if (!epics.has(id)) {
      errors.push(`docs/index.md: epic rollup lists unknown epic '${id}'`);
    }
  }

  for (const [id, feature] of features.entries()) {
    const row = indexFeatures.get(id);
    if (!row) {
      errors.push(`docs/index.md: feature rollup missing '${id}'`);
      continue;
    }
    if (row.status !== feature.status) {
      errors.push(`docs/index.md: feature '${id}' status mismatch (index='${row.status}', doc='${feature.status}')`);
    }
    if (row.epic !== feature.epic) {
      errors.push(`docs/index.md: feature '${id}' epic mismatch (index='${row.epic}', doc='${feature.epic}')`);
    }
    if (row.path !== feature.path) {
      errors.push(`docs/index.md: feature '${id}' path mismatch (index='${row.path}', doc='${feature.path}')`);
    }
  }

  for (const id of indexFeatures.keys()) {
    if (!features.has(id)) {
      errors.push(`docs/index.md: feature rollup lists unknown feature '${id}'`);
    }
  }
}

function buildDocsSet() {
  return new Set(
    walkMarkdownFiles(docsDir)
      .map((absolutePath) => toPosix(path.relative(docsDir, absolutePath)))
      .filter((relativePath) => relativePath !== 'index.md'),
  );
}

const indexMarkdown = readFileSync(indexPath, 'utf8');
const docsSet = buildDocsSet();
const features = collectScopedDocStatuses('features');
const epics = collectScopedDocStatuses('epics');
const deferredFromDocs = collectDeferredFollowupsFromScopedDocs();
const deferredBacklog = collectDeferredFollowupsBacklog();

validateStatusContracts(features, epics);
validateInventory(indexMarkdown);
validateRollups(indexMarkdown, features, epics);
validateDeferredFollowupTracking(deferredFromDocs, deferredBacklog);
validateFeatureRelatedDocs(docsSet);
validateEpicRelatedDocs(docsSet);
validateAdrMetadataAndDocs(docsSet);

if (errors.length > 0) {
  process.stderr.write('docs:check failed\n');
  for (const error of errors) {
    process.stderr.write(`- ${error}\n`);
  }
  process.exit(1);
}

process.stdout.write('docs:check passed\n');
