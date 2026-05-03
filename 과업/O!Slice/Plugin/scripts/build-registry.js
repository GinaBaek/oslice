// build-registry.js
// 디자인 컴포넌트 MD 파일들을 스캔해서 code.ts의 COMPONENT_REGISTRY를 자동 갱신합니다.
//
// 사용법: node scripts/build-registry.js
// 동작:   code.ts의 // <REGISTRY:BEGIN> ... // <REGISTRY:END> 사이를 교체합니다.

const fs = require('fs');
const path = require('path');

// ── 설정 ───────────────────────────────────────────────────────────────────
// 스캔할 MD 폴더(들). 플러그인 폴더 기준 상대경로.
const MD_DIRS = [
  './[SpaceAI] 디자인 컴포넌트 md',
  // 향후 추가: './[ODS] 디자인 컴포넌트 md',
];

const CODE_TS = path.resolve(__dirname, '..', 'code.ts');
const BEGIN_MARKER = '// <REGISTRY:BEGIN>';
const END_MARKER = '// <REGISTRY:END>';

// ── 파서 ───────────────────────────────────────────────────────────────────

function parseMd(mdContent, filePath) {
  // 제목: "# [SpaceAI] Top Bar"
  const titleMatch = mdContent.match(/^#\s+\[([^\]]+)\]\s+(.+?)\s*$/m);
  if (!titleMatch) {
    console.warn(`  ⚠ ${path.basename(filePath)}: 제목 파싱 실패 (예상 형식: # [SpaceAI] Top Bar)`);
    return null;
  }
  const source = titleMatch[1].trim();
  const componentName = titleMatch[2].trim();

  // Node ID: "**Node ID**: `75:411`"
  const nodeIdMatch = mdContent.match(/\*\*Node ID\*\*\s*:\s*`([^`]+)`/);
  const componentId = nodeIdMatch ? nodeIdMatch[1].trim() : undefined;

  // Component Key (선택)
  const keyMatch = mdContent.match(/\*\*Component Key\*\*\s*:\s*`([^`]+)`/);
  const componentKey = keyMatch ? keyMatch[1].trim() : undefined;

  // ## HTML Template 섹션
  const htmlSectionMatch = mdContent.match(/##\s+(?:\d+\.\s+)?HTML Template[\s\S]*?(?=\n##\s|\n#\s|$)/);
  if (!htmlSectionMatch) {
    console.warn(`  ⚠ ${path.basename(filePath)}: ## HTML Template 섹션 없음`);
    return null;
  }
  const htmlSection = htmlSectionMatch[0];

  let template = '';
  const variants = {};

  const subsections = htmlSection.split(/\n###\s+/).slice(1);
  for (const sub of subsections) {
    const headingMatch = sub.match(/^([^\n]+)/);
    if (!headingMatch) continue;
    const heading = headingMatch[1].trim();

    const codeMatch = sub.match(/```html\s*\n([\s\S]*?)\n```/);
    if (!codeMatch) continue;
    const html = codeMatch[1].trim();

    if (/^Default$/i.test(heading)) {
      template = html;
    } else {
      const variantMatch = heading.match(/^Variant\s*:\s*(.+)$/i);
      if (variantMatch) {
        const rawKey = variantMatch[1].trim();
        const parts = rawKey.split(',').map(s => s.trim()).filter(Boolean);
        parts.sort();
        variants[parts.join(',')] = html;
      }
    }
  }

  if (!template && Object.keys(variants).length === 0) {
    console.warn(`  ⚠ ${path.basename(filePath)}: HTML Template 섹션 안에 ### Default/Variant 없음`);
    return null;
  }

  if (!template) template = Object.values(variants)[0];

  return {
    componentKey,
    componentId,
    componentName,
    source,
    template,
    variants: Object.keys(variants).length > 0 ? variants : undefined,
  };
}

function collectMdFiles() {
  const files = [];
  for (const relDir of MD_DIRS) {
    const absDir = path.resolve(__dirname, '..', relDir);
    if (!fs.existsSync(absDir)) {
      console.warn(`⚠ MD 폴더 없음: ${absDir}`);
      continue;
    }
    for (const entry of fs.readdirSync(absDir)) {
      if (entry.endsWith('.md')) files.push(path.join(absDir, entry));
    }
  }
  return files;
}

// ── 코드 생성 ──────────────────────────────────────────────────────────────

function escapeForBacktick(s) {
  return s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

function generateRegistryBlock(entries) {
  const lines = [];
  lines.push(BEGIN_MARKER + ' — DO NOT EDIT. scripts/build-registry.js가 자동 생성합니다.');
  lines.push('// 컴포넌트 추가/수정은 [SpaceAI] 디자인 컴포넌트 md/ 폴더의 MD 파일을 편집하세요.');
  lines.push(`// Generated at: ${new Date().toISOString()} | Total: ${entries.length} entries`);
  lines.push('const COMPONENT_REGISTRY: ComponentTemplate[] = [');

  for (const e of entries) {
    lines.push('  {');
    if (e.componentKey) lines.push(`    componentKey: ${JSON.stringify(e.componentKey)},`);
    if (e.componentId) lines.push(`    componentId: ${JSON.stringify(e.componentId)},`);
    if (e.componentName) lines.push(`    componentName: ${JSON.stringify(e.componentName)},`);
    lines.push(`    source: ${JSON.stringify(e.source)},`);
    lines.push(`    template: \`${escapeForBacktick(e.template)}\`,`);
    if (e.variants) {
      lines.push('    variants: {');
      for (const [k, v] of Object.entries(e.variants)) {
        lines.push(`      ${JSON.stringify(k)}: \`${escapeForBacktick(v)}\`,`);
      }
      lines.push('    },');
    }
    lines.push('  },');
  }

  lines.push('];');
  lines.push(END_MARKER);
  return lines.join('\n');
}

// ── code.ts 교체 ───────────────────────────────────────────────────────────

function replaceRegistryInCodeTs(newBlock) {
  let src = fs.readFileSync(CODE_TS, 'utf-8');
  const beginIdx = src.indexOf(BEGIN_MARKER);
  const endIdx = src.indexOf(END_MARKER);
  if (beginIdx === -1 || endIdx === -1) {
    throw new Error(`code.ts에 ${BEGIN_MARKER} / ${END_MARKER} 마커가 없습니다.`);
  }
  const endLineEnd = src.indexOf('\n', endIdx);
  const after = endLineEnd === -1 ? '' : src.slice(endLineEnd);
  src = src.slice(0, beginIdx) + newBlock + after;
  fs.writeFileSync(CODE_TS, src, 'utf-8');
}

// ── 메인 ───────────────────────────────────────────────────────────────────

function main() {
  console.log('[build-registry] MD 파일 스캔 중...');
  const files = collectMdFiles();
  console.log(`[build-registry] ${files.length}개 MD 파일 발견`);

  const entries = [];
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    const parsed = parseMd(content, file);
    if (parsed) {
      console.log(`  ✓ ${path.basename(file)} → ${parsed.componentName} (id=${parsed.componentId || '-'}, variants=${parsed.variants ? Object.keys(parsed.variants).length : 0})`);
      entries.push(parsed);
    }
  }

  const block = generateRegistryBlock(entries);
  replaceRegistryInCodeTs(block);
  console.log(`[build-registry] ✓ code.ts 갱신됨 (${entries.length} entries)`);
}

main();
