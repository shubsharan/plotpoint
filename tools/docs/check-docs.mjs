import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const docsDir = path.resolve('docs');
const indexPath = path.join(docsDir, 'index.md');

const featureStatuses = new Set([
  'Not Started',
  'In Progress',
  'In Review',
  'Completed',
  'Cancelled',
]);

const epicStatuses = new Set(['Planned', 'In Progress', 'Completed', 'Cancelled']);

const errors = [];

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

function getTableField(markdown, fieldName, filePath) {
  const escaped = fieldName.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
  const matcher = new RegExp(`^\\|\\s*\\*\\*${escaped}\\*\\*\\s*\\|\\s*([^|]+?)\\s*\\|`, 'm');
  const match = markdown.match(matcher);
  if (!match) {
    errors.push(`${filePath}: missing table field **${fieldName}**`);
    return null;
  }
  return match[1].trim();
}

function collectScopedDocStatuses(kind) {
  const dir = path.join(docsDir, kind);
  const prefix = kind === 'features' ? 'FEAT' : 'EPIC';
  const files = walkMarkdownFiles(dir)
    .map((absolutePath) => toPosix(path.relative(docsDir, absolutePath)))
    .filter((relativePath) => relativePath.startsWith(`${kind}/${prefix}-`) && !relativePath.includes('/_template.md'));

  const result = new Map();

  for (const relativePath of files) {
    const absolutePath = path.join(docsDir, relativePath);
    const markdown = readFileSync(absolutePath, 'utf8');
    const idMatch = relativePath.match(/(FEAT|EPIC)-\d{4}/);
    if (!idMatch) {
      errors.push(`${relativePath}: unable to parse scoped id from filename`);
      continue;
    }

    const id = idMatch[0];
    const status = getTableField(markdown, 'Status', relativePath);
    if (!status) {
      continue;
    }

    if (kind === 'features') {
      const epic = getTableField(markdown, 'Epic', relativePath);
      if (!epic) {
        continue;
      }
      result.set(id, { status, epic, path: relativePath });
    } else {
      result.set(id, { status, path: relativePath });
    }
  }

  return result;
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
    indexFeatures.set(match[1], { epic: match[2].trim(), status: match[3].trim(), path: match[4].trim() });
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

const indexMarkdown = readFileSync(indexPath, 'utf8');
const features = collectScopedDocStatuses('features');
const epics = collectScopedDocStatuses('epics');

validateStatusContracts(features, epics);
validateInventory(indexMarkdown);
validateRollups(indexMarkdown, features, epics);

if (errors.length > 0) {
  process.stderr.write('docs:check failed\n');
  for (const error of errors) {
    process.stderr.write(`- ${error}\n`);
  }
  process.exit(1);
}

process.stdout.write('docs:check passed\n');
