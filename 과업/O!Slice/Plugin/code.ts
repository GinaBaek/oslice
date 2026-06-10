figma.showUI(__html__, { width: 400, height: 600 });

(async () => {
  const saved = await figma.clientStorage.getAsync('knownIssues');
  const knownIds: string[] = Array.isArray(saved) ? saved : [];
  figma.ui.postMessage({ type: 'init-known', knownIds });
  // 이전 버전이 쌓아둔 suffix 히스토리는 더 이상 사용 안 함 → 정리
  try { await figma.clientStorage.deleteAsync('oslice-suffix-history'); } catch (_e) { /* 무시 */ }
  // 플러그인 켜기 전에 이미 선택된 프레임이 있으면 현재 상태를 즉시 전달
  const sel = figma.currentPage.selection;
  const validFrames = sel.filter(n => n.type === 'FRAME' || n.type === 'COMPONENT' || n.type === 'COMPONENT_SET');
  const sorted = readingOrderSort(validFrames);
  figma.ui.postMessage({
    type: 'selection-changed',
    hasValidSelection: sorted.length > 0,
    nodeName: sorted.length > 0 ? sorted[0].name : null,
    selectionCount: sorted.length,
    frameNames: sorted.map(n => n.name),
  });
})();

let lastValidatedId: string | null = null;
let pluginSelecting = false;
let lastMutationAt = 0;

// 시각적 reading order로 정렬: 위→아래(행) → 왼쪽→오른쪽(열). 같은 행 판정은 더 작은 프레임 높이의 50% 이내.
function readingOrderSort<T extends SceneNode>(frames: T[]): T[] {
  return frames.slice().sort((a, b) => {
    const ab = (a as any).absoluteBoundingBox;
    const bb = (b as any).absoluteBoundingBox;
    const ay = ab ? ab.y : (a as any).y || 0;
    const by = bb ? bb.y : (b as any).y || 0;
    const ax = ab ? ab.x : (a as any).x || 0;
    const bx = bb ? bb.x : (b as any).x || 0;
    const ah = ab ? ab.height : 0;
    const bh = bb ? bb.height : 0;
    const rowTolerance = Math.max(8, Math.min(ah, bh) * 0.5);
    if (Math.abs(ay - by) < rowTolerance) return ax - bx;
    return ay - by;
  });
}

function getTopLevelFrame(node: SceneNode): FrameNode | null {
  let current: BaseNode = node;
  while (current.parent && (current.parent as any).type !== 'PAGE') {
    current = current.parent;
  }
  return current.type === 'FRAME' ? current as FrameNode : null;
}

function isScreen(frame: FrameNode): boolean {
  if (!frame.parent || (frame.parent as any).type !== 'PAGE') return false;
  return [...frame.children].some(c => {
    const n = c.name.toLowerCase();
    return n.includes('status bar') || n.includes('statusbar') || n === 'header' || n === 'body' || n === 'canvas';
  });
}

figma.on('selectionchange', () => {
  if (pluginSelecting) return;
  const sel = figma.currentPage.selection;

  if (sel.length === 0) {
    // 플러그인 내부 조작(삭제·수정 등) 직후의 deselect는 리셋하지 않음
    if (lastValidatedId && Date.now() - lastMutationAt < 1200) {
      figma.ui.postMessage({ type: 'node-selected', nodeId: '' });
      return;
    }
    // 사용자가 직접 프레임 선택을 해제 → 플러그인 리프레시
    lastValidatedId = null;
    figma.ui.postMessage({ type: 'selection-changed', hasValidSelection: false, selectionCount: 0, frameNames: [] });
    return;
  }

  const node = sel[0];

  // 선택된 노드가 마지막으로 검증한 프레임 내부이면 리셋하지 않고 nodeId만 전달
  if (lastValidatedId && sel.length === 1) {
    let current: BaseNode | null = node;
    while (current) {
      if (current.id === lastValidatedId) {
        figma.ui.postMessage({ type: 'node-selected', nodeId: node.id });
        return;
      }
      current = current.parent;
    }
    // 검증한 프레임 외부 선택 → 컨텍스트 리셋
    lastValidatedId = null;
  }

  const validFrames = sel.filter(n => n.type === 'FRAME' || n.type === 'COMPONENT' || n.type === 'COMPONENT_SET');
  const sortedFrames = readingOrderSort(validFrames);
  figma.ui.postMessage({
    type: 'selection-changed',
    hasValidSelection: sortedFrames.length > 0,
    nodeName: sortedFrames.length > 0 ? sortedFrames[0].name : null,
    selectionCount: sortedFrames.length,
    frameNames: sortedFrames.map(n => n.name),
  });
});

const ANTHROPIC_API_KEY = 'YOUR_API_KEY_HERE';

function isSnakeCase(name: string): boolean {
  return /^[a-z][a-z0-9_]*$/.test(name);
}

type Issue = { type: string; message: string; nodeId: string; nodeName: string };

// ── Helpers ────────────────────────────────────────────────────────────────

function stripEmoji(str: string): string {
  return str.replace(/[\u{1F000}-\u{1FFFF}]|[\u{2600}-\u{27BF}]|[\u{2300}-\u{23FF}]|[\uD800-\uDBFF][\uDC00-\uDFFF]|\p{Emoji_Presentation}/gu, '').replace(/\s+/g, ' ').trim();
}

function stripBracketTags(str: string): string {
  if (/\[Icon\]/i.test(str)) return 'Icon';
  if (/\[Asset\]/i.test(str)) return 'Asset';
  return str
    .replace(/\[[^\]]+\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function getCompName(instance: InstanceNode): Promise<string> {
  const comp = await instance.getMainComponentAsync();
  if (!comp) return 'Component';
  const raw = comp.parent && comp.parent.type === 'COMPONENT_SET' ? comp.parent.name : comp.name;
  const cleaned = stripBracketTags(stripEmoji(raw));
  if (!cleaned) return 'Component';
  if (/img$/i.test(cleaned)) return 'Img';
  return cleaned;
}

async function isHeadingText(textNode: TextNode): Promise<boolean> {
  const boundVars = (textNode as any).boundVariables;
  if (!boundVars) return false;
  const vars = (figma as any).variables;
  if (!vars || !vars.getVariableByIdAsync) return false;
  for (const key of Object.keys(boundVars)) {
    const binding = boundVars[key];
    const bindings = Array.isArray(binding) ? binding : [binding];
    for (const b of bindings) {
      if (b && b.id) {
        try {
          const variable = await vars.getVariableByIdAsync(b.id);
          if (variable && typeof variable.name === 'string' && variable.name.toLowerCase().includes('heading')) return true;
        } catch (_) {}
      }
    }
  }
  return false;
}

async function isHeadingInstance(inst: InstanceNode): Promise<boolean> {
  const kids = [...inst.children];
  if (kids.length === 0 || !kids.every(c => c.type === 'TEXT')) return false;
  for (const kid of kids) {
    if (await isHeadingText(kid as TextNode)) return true;
  }
  return false;
}

function isTextInstance(inst: InstanceNode): boolean {
  const kids = [...inst.children];
  return kids.length > 0 && kids.every(c => c.type === 'TEXT') && inst.name.toLowerCase().includes('text');
}

function findFirstInstance(frame: FrameNode): InstanceNode | null {
  for (const child of frame.children) {
    if (child.type === 'INSTANCE') return child as InstanceNode;
    if (child.type === 'FRAME') {
      const found = findFirstInstance(child as FrameNode);
      if (found) return found;
    }
  }
  return null;
}

function getShapeLabel(node: SceneNode): string {
  const n = node.name.toLowerCase();
  // GIF은 Figma에 별도 속성이 없어 이름 기반으로 유지
  if (n.includes('gif')) return 'GIF';
  const fills = (node as any).fills as readonly Paint[] | undefined;
  if (fills && fills.some((f: Paint) => f.type === 'IMAGE')) return 'Img';
  const strokes = (node as any).strokes as readonly Paint[] | undefined;
  const hasVisibleFill = fills && fills.some((f: Paint) => (f as any).visible !== false);
  if (strokes && strokes.length > 0 && !hasVisibleFill) return 'Stroke';
  return 'Shape';
}

async function isSameComponent(instances: InstanceNode[]): Promise<boolean> {
  if (instances.length <= 1) return true;
  const first = await getCompName(instances[0]);
  for (let i = 1; i < instances.length; i++) {
    if (await getCompName(instances[i]) !== first) return false;
  }
  return true;
}

// FRAME에 콘텐츠가 있으면 ungroup(자식을 부모로 옮기고 wrapper만 제거), 그 외는 그냥 remove
function removeOrUngroup(sceneNode: SceneNode): void {
  if (
    sceneNode.type === 'FRAME' &&
    (sceneNode as FrameNode).children.length > 0 &&
    sceneNode.parent && sceneNode.parent.type === 'FRAME'
  ) {
    const frame = sceneNode as FrameNode;
    const parent = sceneNode.parent as FrameNode;
    // 이전 단계에서 visible=false로 숨겨졌을 수 있음 → 자식들이 invisible 상태로 옮겨가지 않게 복원
    if (!frame.visible) frame.visible = true;
    const frameIndex = [...parent.children].indexOf(frame as any);
    const kids = [...frame.children];
    for (let i = kids.length - 1; i >= 0; i--) parent.insertChild(frameIndex, kids[i]);
    frame.remove();
  } else {
    sceneNode.remove();
  }
}

function isStructuralName(name: string): boolean {
  return name === 'Body' || name === 'Canvas' || name === 'List' || name === 'Row' ||
    name === 'Header' || name === 'Footer' ||
    name === 'Status Bar' || name === 'Top Bar' || name === 'CTA Bar' ||
    name.endsWith('Area');
}

// ── Naming Logic ───────────────────────────────────────────────────────────

function isListLikeFrame(cf: FrameNode): boolean {
  const cfChildren = [...cf.children];
  const allInst = cfChildren.length >= 2 && cfChildren.every(gc => gc.type === 'INSTANCE');
  const allRows = cfChildren.length >= 1 && cfChildren.every(gc =>
    gc.type === 'FRAME' && [...(gc as FrameNode).children].every(ggc => ggc.type === 'INSTANCE')
  );
  return cf.name === 'List' || allInst || allRows;
}

async function computeAreaName(frame: FrameNode): Promise<string> {
  const children = [...frame.children];
  const parts: string[] = [];

  for (const child of children) {
    if (child.type === 'TEXT') {
      const heading = await isHeadingText(child as TextNode);
      const label = heading ? 'Title' : 'Text';
      if (!parts.includes(label)) parts.push(label);
    } else if (child.type === 'INSTANCE') {
      const inst = child as InstanceNode;
      if (isTextInstance(inst)) {
        const heading = await isHeadingInstance(inst);
        const label = heading ? 'Title' : 'Text';
        if (!parts.includes(label)) parts.push(label);
        continue;
      }
      const name = await getCompName(inst);
      if (!parts.includes(name)) parts.push(name);
    } else if (child.type === 'FRAME') {
      const cf = child as FrameNode;
      if (isListLikeFrame(cf)) {
        // List 첫 항목이 FRAME(예: Row[Text, Comp])이면 그 안의 콘텐츠 패턴 전체를 반영
        // 예: List > Row > [Text, Comp] → 'Text + Comp Area'
        const firstItem = cf.children[0];
        if (firstItem && firstItem.type === 'FRAME') {
          const rowInnerName = await computeAreaName(firstItem as FrameNode);
          const rowParts = rowInnerName.replace(/ Area$/, '').split(' + ');
          for (const p of rowParts) {
            if (p && p !== (firstItem as FrameNode).name && !parts.includes(p)) parts.push(p);
          }
        } else {
          // List 직접 자식이 INSTANCE면 첫 모듈 이름 사용 (기존 동작)
          const moduleInst = findFirstInstance(cf);
          if (moduleInst) {
            const name = await getCompName(moduleInst);
            if (!parts.includes(name)) parts.push(name);
          }
        }
      } else {
        // 일반 FRAME(예: Title Area, Text Area 같은 wrapper)도 내부 콘텐츠를 재귀로 추출해서 parts에 합침
        const innerName = await computeAreaName(cf);
        const innerParts = innerName.replace(/ Area$/, '').split(' + ');
        for (const p of innerParts) {
          if (p && p !== cf.name && !parts.includes(p)) parts.push(p);
        }
      }
    } else if (child.type === 'RECTANGLE' || child.type === 'ELLIPSE' || child.type === 'VECTOR') {
      const label = getShapeLabel(child);
      if (!parts.includes(label)) parts.push(label);
    }
  }

  if (parts.length === 0) return frame.name;
  return parts.join(' + ') + ' Area';
}

async function computeFrameName(frame: FrameNode): Promise<string | null> {
  if (!frame.parent || (frame.parent as any).type === 'PAGE') return null;
  if (['Body', 'Canvas', 'Status Bar', 'Top Bar', 'CTA Bar', 'List', 'Row'].includes(frame.name)) return null;

  const children = [...frame.children];
  if (children.length === 0) return null;

  const allInstances = children.every(c => c.type === 'INSTANCE');
  if (allInstances) {
    if (children.length === 1) {
      const inst = children[0] as InstanceNode;
      if (isTextInstance(inst)) {
        const heading = await isHeadingInstance(inst);
        return heading ? 'Title Area' : 'Text Area';
      }
      return (await getCompName(inst)) + ' Area';
    }
    if (frame.parent.type === 'FRAME' && (frame.parent as FrameNode).name === 'List') return 'Row';
    if (await isSameComponent(children as InstanceNode[])) return 'List';
    // 컴포넌트가 혼합된 경우 Area로 네이밍
    if (frame.name.endsWith('Area')) return null;
    return await computeAreaName(frame);
  }

  const allFrames = children.every(c => c.type === 'FRAME');
  if (allFrames && children.length >= 2) {
    const allRowsOfInstances = children.every(c => {
      const cf = c as FrameNode;
      return cf.children.length > 0 && [...cf.children].every(gc => gc.type === 'INSTANCE');
    });
    if (allRowsOfInstances) {
      let allRowsUniform = true;
      for (const child of children) {
        if (!await isSameComponent([...(child as FrameNode).children] as InstanceNode[])) {
          allRowsUniform = false;
          break;
        }
      }
      if (allRowsUniform) {
        if (frame.name.endsWith('Area')) return null;
        return 'List';
      }
    }
  }

  return await computeAreaName(frame);
}

// Area 프레임의 규칙 위반 수 카운트 — nested-area 발생 시 inner/outer 중 더 위반 많은 쪽 제거 판단용
async function countAreaViolations(frame: FrameNode): Promise<number> {
  let count = 0;
  // 1. 이름이 computeFrameName 결과와 다름
  const expected = await computeFrameName(frame);
  if (expected !== null && expected !== frame.name) count++;
  // 2. 첫 형제가 아닌데 상단 패딩 존재
  if (frame.parent && frame.parent.type === 'FRAME') {
    const siblings = [...(frame.parent as FrameNode).children];
    const isFirst = siblings[0].id === frame.id;
    if (!isFirst && frame.paddingTop > 0) count++;
  }
  // 3. 하단 패딩 존재 (Body 외 어떤 Area도 0이어야 함)
  if (frame.paddingBottom > 0) count++;
  // 4. Auto-layout 없음
  if (frame.layoutMode === 'NONE') count++;
  // 5. 부모가 VERTICAL auto-layout인데 가로 Fill 아님 (HORIZONTAL 부모는 다양한 sizing 허용)
  if (frame.parent && frame.parent.type === 'FRAME' && (frame.parent as FrameNode).layoutMode === 'VERTICAL') {
    const sizing = (frame as any).layoutSizingHorizontal;
    if (sizing !== undefined && sizing !== 'FILL') count++;
  }
  return count;
}

// ── Revert ─────────────────────────────────────────────────────────────────

type FrameSnapshot = {
  name: string;
  layoutMode: 'NONE' | 'HORIZONTAL' | 'VERTICAL';
  primaryAxisAlignItems: 'MIN' | 'MAX' | 'CENTER' | 'SPACE_BETWEEN';
  counterAxisAlignItems: 'MIN' | 'MAX' | 'CENTER' | 'BASELINE';
  primaryAxisSizingMode: 'FIXED' | 'AUTO';
  counterAxisSizingMode: 'FIXED' | 'AUTO';
  itemSpacing: number;
  paddingTop: number; paddingBottom: number; paddingLeft: number; paddingRight: number;
  width: number; height: number;
  fills: readonly Paint[];
  strokes: readonly Paint[];
  strokeWeight: number;
  strokeAlign: 'INSIDE' | 'OUTSIDE' | 'CENTER';
  effects: readonly Effect[];
  clipsContent: boolean;
  childIds: string[];
};

function snapshotFrame(frame: FrameNode): FrameSnapshot {
  return {
    name: frame.name,
    layoutMode: frame.layoutMode as 'NONE' | 'HORIZONTAL' | 'VERTICAL',
    primaryAxisAlignItems: frame.primaryAxisAlignItems as any,
    counterAxisAlignItems: frame.counterAxisAlignItems as any,
    primaryAxisSizingMode: frame.primaryAxisSizingMode as any,
    counterAxisSizingMode: frame.counterAxisSizingMode as any,
    itemSpacing: frame.itemSpacing,
    paddingTop: frame.paddingTop, paddingBottom: frame.paddingBottom,
    paddingLeft: frame.paddingLeft, paddingRight: frame.paddingRight,
    width: frame.width, height: frame.height,
    fills: (Array.isArray(frame.fills) ? frame.fills : []) as Paint[],
    strokes: (Array.isArray(frame.strokes) ? frame.strokes : []) as Paint[],
    strokeWeight: typeof frame.strokeWeight === 'number' ? frame.strokeWeight : 0,
    strokeAlign: frame.strokeAlign as 'INSIDE' | 'OUTSIDE' | 'CENTER',
    effects: [...frame.effects] as Effect[],
    clipsContent: frame.clipsContent,
    childIds: [...frame.children].map(c => c.id),
  };
}

async function restoreFrame(frame: FrameNode, snap: FrameSnapshot) {
  frame.name = snap.name;
  frame.fills = snap.fills as Paint[];
  frame.strokes = snap.strokes as Paint[];
  if (snap.strokes.length > 0) {
    frame.strokeWeight = snap.strokeWeight;
    frame.strokeAlign = snap.strokeAlign;
  }
  frame.effects = snap.effects as Effect[];
  frame.clipsContent = snap.clipsContent;
  frame.paddingTop = snap.paddingTop;
  frame.paddingBottom = snap.paddingBottom;
  frame.paddingLeft = snap.paddingLeft;
  frame.paddingRight = snap.paddingRight;
  frame.itemSpacing = snap.itemSpacing;
  if (snap.layoutMode === 'NONE') {
    frame.layoutMode = 'NONE';
    frame.resize(snap.width, snap.height);
  } else {
    frame.layoutMode = snap.layoutMode;
    frame.primaryAxisAlignItems = snap.primaryAxisAlignItems;
    frame.counterAxisAlignItems = snap.counterAxisAlignItems;
    frame.primaryAxisSizingMode = snap.primaryAxisSizingMode;
    frame.counterAxisSizingMode = snap.counterAxisSizingMode;
    if (snap.primaryAxisSizingMode === 'FIXED') frame.resize(snap.width, frame.height);
    if (snap.counterAxisSizingMode === 'FIXED') frame.resize(frame.width, snap.height);
  }
}

// 삭제되는 Area의 시각 속성(fills/strokes/effects/clipsContent)을 받는 쪽에 전이.
// 받는 쪽에 이미 값이 있으면(충돌) 그대로 두고, 비어있을 때만 옮겨 손실 방지.
function transferAreaProps(from: FrameNode, to: FrameNode): void {
  const toFills = Array.isArray(to.fills) ? to.fills : [];
  if (toFills.length === 0 && Array.isArray(from.fills) && from.fills.length > 0) {
    to.fills = from.fills as Paint[];
  }
  const toStrokes = Array.isArray(to.strokes) ? to.strokes : [];
  if (toStrokes.length === 0 && Array.isArray(from.strokes) && from.strokes.length > 0) {
    to.strokes = from.strokes as Paint[];
    if (typeof from.strokeWeight === 'number') to.strokeWeight = from.strokeWeight;
    to.strokeAlign = from.strokeAlign;
  }
  if (to.effects.length === 0 && from.effects.length > 0) {
    to.effects = from.effects as Effect[];
  }
  if (from.clipsContent) to.clipsContent = true;
}

type RevertOp =
  | { op: 'rename'; nodeId: string; name: string }
  | { op: 'remove-layout'; nodeId: string; snap: FrameSnapshot }
  | { op: 'unwrap-list'; parentId: string; listId: string; childPositions?: { id: string; x: number; y: number }[] }
  | { op: 'rewrap-area'; parentId: string; insertIndex: number; snap: FrameSnapshot; parentPaddingSnap: { pt: number; pb: number; pl: number; pr: number } }
  | { op: 'show-node'; nodeId: string }
  | { op: 'restore-scroll'; nodeId: string; overflowDirection: OverflowDirection; numberOfFixedChildren: number }
  | { op: 'restore-horizontal-sizing'; nodeId: string; layoutSizingHorizontal: string };

async function applyRevert(ops: RevertOp[]) {
  for (const op of [...ops].reverse()) {
    if (op.op === 'rename') {
      const node = await figma.getNodeByIdAsync(op.nodeId);
      if (node) (node as any).name = op.name;
    }
    if (op.op === 'remove-layout') {
      const node = await figma.getNodeByIdAsync(op.nodeId);
      if (node && node.type === 'FRAME') await restoreFrame(node as FrameNode, op.snap);
    }
    if (op.op === 'unwrap-list') {
      const parent = await figma.getNodeByIdAsync(op.parentId);
      const list = await figma.getNodeByIdAsync(op.listId);
      if (parent && parent.type === 'FRAME' && list && list.type === 'FRAME') {
        const pf = parent as FrameNode;
        const lf = list as FrameNode;
        const idx = [...pf.children].indexOf(lf as any);
        const kids = [...lf.children];
        for (let i = kids.length - 1; i >= 0; i--) pf.insertChild(idx, kids[i]);
        lf.remove();
        if (op.childPositions) {
          for (const pos of op.childPositions) {
            const child = await figma.getNodeByIdAsync(pos.id);
            if (child && (child as any).x !== undefined) {
              (child as any).x = pos.x;
              (child as any).y = pos.y;
            }
          }
        }
      }
    }
    if (op.op === 'show-node') {
      const node = await figma.getNodeByIdAsync(op.nodeId);
      if (node) (node as SceneNode).visible = true;
    }
    if (op.op === 'restore-scroll') {
      const node = await figma.getNodeByIdAsync(op.nodeId);
      if (node && node.type === 'FRAME') {
        const frame = node as FrameNode;
        frame.overflowDirection = op.overflowDirection;
        frame.numberOfFixedChildren = op.numberOfFixedChildren;
      }
    }
    if (op.op === 'restore-horizontal-sizing') {
      const node = await figma.getNodeByIdAsync(op.nodeId);
      if (node && node.type === 'FRAME') {
        (node as any).layoutSizingHorizontal = op.layoutSizingHorizontal;
      }
    }
    if (op.op === 'rewrap-area') {
      const parent = await figma.getNodeByIdAsync(op.parentId);
      if (!parent || parent.type !== 'FRAME') continue;
      const pf = parent as FrameNode;
      pf.paddingTop = op.parentPaddingSnap.pt;
      pf.paddingBottom = op.parentPaddingSnap.pb;
      pf.paddingLeft = op.parentPaddingSnap.pl;
      pf.paddingRight = op.parentPaddingSnap.pr;
      const inner = figma.createFrame();
      pf.insertChild(op.insertIndex, inner);
      await restoreFrame(inner, op.snap);
      for (const childId of op.snap.childIds) {
        const child = await figma.getNodeByIdAsync(childId);
        if (child) inner.appendChild(child as SceneNode);
      }
    }
  }
}

function makeAreaFrame(name: string, paddingTop: number = 0): FrameNode {
  const area = figma.createFrame();
  area.name = name;
  area.fills = [];
  area.clipsContent = false;
  area.layoutMode = 'VERTICAL';
  area.primaryAxisSizingMode = 'AUTO';
  area.counterAxisSizingMode = 'AUTO';
  area.primaryAxisAlignItems = 'MIN';
  area.counterAxisAlignItems = 'MIN';
  area.paddingTop = paddingTop;
  area.paddingBottom = 0;
  return area;
}

function makeListFrame(direction: 'HORIZONTAL' | 'VERTICAL'): FrameNode {
  const list = figma.createFrame();
  list.name = 'List';
  list.fills = [];
  list.clipsContent = false;
  list.layoutMode = direction;
  list.primaryAxisSizingMode = 'AUTO';
  list.counterAxisSizingMode = 'AUTO';
  list.primaryAxisAlignItems = 'MIN';
  list.counterAxisAlignItems = 'MIN';
  return list;
}

async function applyAreaGrouping(frame: FrameNode): Promise<RevertOp[]> {
  const ops: RevertOp[] = [];
  const allInstances = [...frame.children].filter(c => c.type === 'INSTANCE') as InstanceNode[];
  if (allInstances.length === 0) return ops;

  // 절대 위치 자식 vs 흐름 자식 분리: absolute는 각자 Area로 감싸 위치값 보존
  const absoluteInstances: InstanceNode[] = [];
  const instances: InstanceNode[] = [];
  for (const inst of allInstances) {
    if ((inst as any).layoutPositioning === 'ABSOLUTE') absoluteInstances.push(inst);
    else instances.push(inst);
  }

  const bodySnap = snapshotFrame(frame);
  const bodyPaddingTop = frame.paddingTop;

  if (frame.layoutMode === 'NONE' && instances.length > 0) applyAutoLayout(frame);

  // 모든 인스턴스의 컴포넌트 이름 미리 계산 (absolute 포함)
  const compNameMap = new Map<string, string>();
  for (const inst of allInstances) {
    compNameMap.set(inst.id, await getCompName(inst));
  }

  // absolute 인스턴스 처리: 각자 Area로 감쌈 (지나님 예시 패턴)
  //   - Area는 Canvas 너비에 맞춰서 가로로 펴고 x=0, y=인스턴스 원래 y
  //   - 원래 인스턴스 x → Area paddingLeft로 보존 (가로 자리 유지)
  //   - 원래 우측 gap → Area paddingRight
  //   - 다음 absolute 형제(또는 Canvas 하단)까지의 gap → Area paddingBottom (시각적 breathing space 보존)
  const absInfo = absoluteInstances.map(inst => ({
    inst,
    x: inst.x,
    y: inst.y,
    w: inst.width,
    h: inst.height,
  }));
  absInfo.sort((a, b) => a.y - b.y);

  for (let idx = 0; idx < absInfo.length; idx++) {
    const { inst, x: instX, y: instY, w: instW, h: instH } = absInfo[idx];
    const bottomGap = idx + 1 < absInfo.length
      ? Math.max(0, absInfo[idx + 1].y - (instY + instH))
      : Math.max(0, frame.height - (instY + instH));
    const compName = compNameMap.get(inst.id) || 'Component';
    const area = figma.createFrame();
    area.name = compName + ' Area';
    area.fills = [];
    area.clipsContent = false;
    area.layoutMode = 'VERTICAL';
    area.primaryAxisSizingMode = 'AUTO';
    area.counterAxisSizingMode = 'FIXED';
    area.primaryAxisAlignItems = 'MIN';
    area.counterAxisAlignItems = 'MIN';
    area.paddingTop = 0;
    area.paddingBottom = bottomGap;
    area.paddingLeft = Math.max(0, instX);
    area.paddingRight = Math.max(0, frame.width - instX - instW);
    area.resize(frame.width, Math.max(1, instH + bottomGap));
    frame.appendChild(area);
    if (frame.layoutMode !== 'NONE') {
      (area as any).layoutPositioning = 'ABSOLUTE';
    }
    area.x = 0;
    area.y = instY;
    area.appendChild(inst);
    ops.push({ op: 'unwrap-list', parentId: frame.id, listId: area.id });
  }

  if (instances.length === 0) {
    ops.unshift({ op: 'remove-layout', nodeId: frame.id, snap: bodySnap });
    return ops;
  }

  const slices = groupByHorizontalSlice(instances);

  // 슬라이스의 컴포넌트 조합 시그니처 (정렬된 고유 이름)
  function sliceSig(slice: SceneNode[]): string {
    const names = slice.map(n => compNameMap.get(n.id) || 'Component');
    return [...new Set(names)].sort().join('+');
  }

  // 연속된 같은 조합 슬라이스를 하나의 그룹으로 병합
  type Group =
    | { kind: 'rows'; slices: SceneNode[][] }
    | { kind: 'single'; slice: SceneNode[] };

  // 슬라이스 내 모든 인스턴스가 동일 컴포넌트인지 확인
  function isUniformSlice(slice: SceneNode[]): boolean {
    if (slice.length === 0) return false;
    const first = compNameMap.get(slice[0].id) || 'Component';
    return slice.every(n => (compNameMap.get(n.id) || 'Component') === first);
  }

  const groups: Group[] = [];
  let i = 0;
  while (i < slices.length) {
    const sig = sliceSig(slices[i]);
    const uniform = isUniformSlice(slices[i]);
    if (uniform) {
      let j = i + 1;
      while (j < slices.length && isUniformSlice(slices[j]) && sliceSig(slices[j]) === sig) j++;
      if (j - i >= 2) {
        groups.push({ kind: 'rows', slices: slices.slice(i, j) });
        i = j;
        continue;
      }
    }
    groups.push({ kind: 'single', slice: slices[i] });
    i++;
  }

  const createdAreas: FrameNode[] = [];

  for (const group of groups) {
    if (group.kind === 'rows') {
      // 반복 Row 구조: Area > List > [Row, Row, ...]
      const firstSlice = group.slices[0];
      const compNames: string[] = [];
      for (const n of firstSlice) {
        const name = compNameMap.get(n.id) || 'Component';
        if (!compNames.includes(name)) compNames.push(name);
      }
      const areaName = compNames.join(' + ') + ' Area';
      const firstIndex = [...frame.children].indexOf(firstSlice[0] as any);

      const area = makeAreaFrame(areaName, bodyPaddingTop);
      frame.insertChild(firstIndex, area);
      createdAreas.push(area);

      const list = makeListFrame('VERTICAL');
      area.appendChild(list);

      for (const slice of group.slices) {
        const row = figma.createFrame();
        row.name = 'Row';
        row.fills = [];
        row.clipsContent = false;
        row.layoutMode = 'HORIZONTAL';
        row.primaryAxisSizingMode = 'AUTO';
        row.counterAxisSizingMode = 'AUTO';
        row.primaryAxisAlignItems = 'MIN';
        row.counterAxisAlignItems = 'MIN';
        list.appendChild(row);
        for (const inst of slice) row.appendChild(inst as InstanceNode);
      }

      ops.push({ op: 'unwrap-list', parentId: frame.id, listId: area.id });
    } else {
      // 단일 슬라이스
      const { slice } = group;
      const compNames: string[] = [];
      for (const n of slice) {
        const name = compNameMap.get(n.id) || 'Component';
        if (!compNames.includes(name)) compNames.push(name);
      }
      const areaName = compNames.join(' + ') + ' Area';
      const firstIndex = [...frame.children].indexOf(slice[0] as any);

      const area = makeAreaFrame(areaName, bodyPaddingTop);
      frame.insertChild(firstIndex, area);
      createdAreas.push(area);

      if (slice.length >= 2 && compNames.length === 1) {
        // 같은 컴포넌트 여러 개 → List로 감싸기
        const list = makeListFrame(inferDirection(slice as SceneNode[]));
        area.appendChild(list);
        for (const inst of slice) list.appendChild(inst as InstanceNode);
        ops.push({ op: 'unwrap-list', parentId: area.id, listId: list.id });
      } else {
        for (const inst of slice) area.appendChild(inst as InstanceNode);
      }
      ops.push({ op: 'unwrap-list', parentId: frame.id, listId: area.id });
    }
  }

  if (createdAreas.length > 0) {
    // 모든 Area의 상·하단 패딩 0 (Body/Canvas 자체가 외곽 패딩을 가짐)
    for (let i = 0; i < createdAreas.length; i++) {
      createdAreas[i].paddingTop = 0;
      createdAreas[i].paddingBottom = 0;
    }
    // Body는 하단 패딩 64 강제. Canvas는 외곽 패딩 유지하지 않음 (캔버스 자유 위치).
    frame.paddingTop = bodyPaddingTop;
    if (frame.name === 'Body') frame.paddingBottom = 64;
  }

  ops.unshift({ op: 'remove-layout', nodeId: frame.id, snap: bodySnap });
  return ops;
}

async function applyAreaGroupingById(nodeId: string): Promise<RevertOp[]> {
  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node || node.type !== 'FRAME') throw new Error('노드를 찾을 수 없어요.');
  return applyAreaGrouping(node as FrameNode);
}

// ── Structure Logic ────────────────────────────────────────────────────────

function inferDirection(nodes: readonly SceneNode[]): 'HORIZONTAL' | 'VERTICAL' {
  if (nodes.length < 2) return 'VERTICAL';
  const a = nodes[0] as any;
  const b = nodes[1] as any;
  return Math.abs(b.x - a.x) > Math.abs(b.y - a.y) ? 'HORIZONTAL' : 'VERTICAL';
}

function groupByHorizontalSlice(nodes: SceneNode[]): SceneNode[][] {
  if (nodes.length === 0) return [];
  const sorted = [...nodes].sort((a, b) => (a as any).y - (b as any).y);
  const slices: SceneNode[][] = [];
  let current: SceneNode[] = [sorted[0]];
  let maxY = (sorted[0] as any).y + (sorted[0] as any).height;
  for (let i = 1; i < sorted.length; i++) {
    const node = sorted[i];
    const nodeY = (node as any).y;
    if (nodeY < maxY) {
      current.push(node);
      maxY = Math.max(maxY, nodeY + (node as any).height);
    } else {
      slices.push(current);
      current = [node];
      maxY = nodeY + (node as any).height;
    }
  }
  slices.push(current);
  return slices;
}

function applyAutoLayout(frame: FrameNode) {
  const children = [...frame.children];
  const direction = inferDirection(frame.children);

  // 레이아웃 적용 전 자식 위치 기록
  const withPos = children.map(c => ({
    node: c,
    x: (c as any).x as number,
    y: (c as any).y as number,
    w: (c as any).width as number,
    h: (c as any).height as number,
  }));

  // children 배열을 시각적 순서(Y 또는 X)로 재정렬
  const sorted = direction === 'VERTICAL'
    ? [...withPos].sort((a, b) => a.y - b.y)
    : [...withPos].sort((a, b) => a.x - b.x);

  sorted.forEach((item, index) => frame.insertChild(index, item.node));

  frame.layoutMode = direction;
  frame.primaryAxisAlignItems = 'MIN';
  frame.counterAxisAlignItems = 'MIN';

  if (sorted.length === 0) return;

  if (direction === 'VERTICAL') {
    frame.paddingTop = Math.max(0, Math.round(sorted[0].y));
    if (sorted.length > 1) {
      const gaps = sorted.slice(1).map((p, i) => Math.max(0, Math.round(p.y - (sorted[i].y + sorted[i].h))));
      frame.itemSpacing = Math.min(...gaps);
    }
  } else {
    frame.paddingLeft = Math.max(0, Math.round(sorted[0].x));
    if (sorted.length > 1) {
      const gaps = sorted.slice(1).map((p, i) => Math.max(0, Math.round(p.x - (sorted[i].x + sorted[i].w))));
      frame.itemSpacing = Math.min(...gaps);
    }
  }
}

function wrapInList(frame: FrameNode, instances: SceneNode[]): FrameNode {
  const list = figma.createFrame();
  list.name = 'List';
  list.fills = [];
  list.clipsContent = false;

  const direction: 'HORIZONTAL' | 'VERTICAL' =
    frame.layoutMode !== 'NONE'
      ? (frame.layoutMode as 'HORIZONTAL' | 'VERTICAL')
      : inferDirection(instances);

  list.layoutMode = direction;
  list.primaryAxisSizingMode = 'AUTO';
  list.counterAxisSizingMode = 'AUTO';
  list.primaryAxisAlignItems = 'MIN';
  list.counterAxisAlignItems = 'MIN';
  if (frame.itemSpacing) list.itemSpacing = frame.itemSpacing;

  const frameChildren = [...frame.children];
  const firstIndex = frameChildren.indexOf(instances[0] as any);
  frame.insertChild(firstIndex, list);

  for (const inst of instances) list.appendChild(inst);
  return list;
}

async function applyStructureFix(nodeId: string): Promise<RevertOp[]> {
  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node || node.type !== 'FRAME') throw new Error('노드를 찾을 수 없어요.');
  const frame = node as FrameNode;
  const children = [...frame.children];
  const ops: RevertOp[] = [];

  // Screen 레벨: Body 이름 오류 → rename
  if (frame.parent && frame.parent.type === 'FRAME' && isScreen(frame.parent as FrameNode)) {
    ops.push({ op: 'rename', nodeId: frame.id, name: frame.name });
    frame.name = 'Body';
    return ops;
  }

  // Screen 레벨: Body 없음 → non-structural children을 Body로 묶기
  if (isScreen(frame)) {
    const EXCLUDE: ScreenSlot[] = ['header', 'footer'];
    const categorized: { node: SceneNode; slot: ScreenSlot }[] = [];
    for (const child of children) {
      categorized.push({ node: child, slot: await categorizeScreenChild(child) });
    }
    const toWrap = categorized.filter(c => !EXCLUDE.includes(c.slot)).map(c => c.node);
    if (toWrap.length === 0) throw new Error('묶을 레이어가 없어요.');

    // 자식 위치 스냅샷 (auto layout 적용 전 절대 좌표 보존)
    const childPositions = toWrap.map(c => ({
      id: c.id,
      x: (c as any).x as number,
      y: (c as any).y as number,
    }));

    const insertIndex = categorized.findIndex(c => !EXCLUDE.includes(c.slot));
    const body = figma.createFrame();
    body.name = 'Body';
    body.fills = [];
    body.clipsContent = false;
    body.layoutMode = 'VERTICAL';
    body.primaryAxisSizingMode = 'AUTO';
    body.counterAxisSizingMode = 'FIXED';
    body.counterAxisAlignItems = 'MIN';
    body.primaryAxisAlignItems = 'MIN';
    body.resize(frame.width, body.height);
    frame.insertChild(insertIndex, body);
    for (const child of toWrap) body.appendChild(child);
    ops.push({ op: 'unwrap-list', parentId: frame.id, listId: body.id, childPositions });
    return ops;
  }

  // List가 Area 없이 직접 있는 경우 → Area로 감싸기
  if (
    frame.name === 'List' &&
    frame.parent &&
    frame.parent.type === 'FRAME' &&
    !(frame.parent as FrameNode).name.endsWith('Area')
  ) {
    const parentFrame = frame.parent as FrameNode;
    const firstInst = findFirstInstance(frame);
    const compName = firstInst ? await getCompName(firstInst) : 'Component';

    // 부모가 비구조적 프레임이면 새 Area를 만들지 않고 부모를 Area로 rename
    // → 이중 래핑 방지 (SomeFrame > Area > List 대신 SomeFrame(→Area) > List)
    if (!isStructuralName(parentFrame.name)) {
      ops.push({ op: 'rename', nodeId: parentFrame.id, name: parentFrame.name });
      parentFrame.name = compName + ' Area';
      return ops;
    }

    // 부모가 Body 등 구조적 프레임이면 새 Area 생성
    const frameIndex = [...parentFrame.children].indexOf(frame as any);
    const area = figma.createFrame();
    area.name = compName + ' Area';
    area.fills = [];
    area.clipsContent = false;
    area.layoutMode = parentFrame.layoutMode !== 'NONE' ? parentFrame.layoutMode as 'HORIZONTAL' | 'VERTICAL' : 'VERTICAL';
    area.primaryAxisSizingMode = 'AUTO';
    area.counterAxisSizingMode = 'AUTO';
    area.primaryAxisAlignItems = 'MIN';
    area.counterAxisAlignItems = 'MIN';
    parentFrame.insertChild(frameIndex, area);
    area.appendChild(frame);
    ops.push({ op: 'unwrap-list', parentId: parentFrame.id, listId: area.id });
    return ops;
  }

  // 중첩 Area → inner/outer 각각의 규칙 위반 수를 세서 더 많이 어긴 쪽 제거 (동률은 inner 제거)
  if (frame.name.endsWith('Area')) {
    let outerArea: FrameNode | null = null;
    let cursor: any = frame.parent;
    while (cursor && cursor.type !== 'PAGE') {
      if (cursor.type === 'FRAME' && (cursor as FrameNode).name.endsWith('Area')) {
        outerArea = cursor as FrameNode;
        break;
      }
      cursor = cursor.parent;
    }
    if (outerArea && frame.parent && frame.parent.type === 'FRAME') {
      const innerViolations = await countAreaViolations(frame);
      const outerViolations = await countAreaViolations(outerArea);
      const removeOuter = outerViolations > innerViolations;
      if (removeOuter && outerArea.parent && outerArea.parent.type === 'FRAME') {
        const gpFrame = outerArea.parent as FrameNode;
        const outerIndex = [...gpFrame.children].indexOf(outerArea as any);
        // 받는 쪽(gpFrame)의 시각 속성도 snapshot으로 revert 가능하게
        ops.push({ op: 'remove-layout', nodeId: gpFrame.id, snap: snapshotFrame(gpFrame) });
        ops.push({ op: 'rewrap-area', parentId: gpFrame.id, insertIndex: outerIndex, snap: snapshotFrame(outerArea), parentPaddingSnap: { pt: gpFrame.paddingTop, pb: gpFrame.paddingBottom, pl: gpFrame.paddingLeft, pr: gpFrame.paddingRight } });
        // 패딩 합산 + 시각 속성 전이 (받는 쪽이 비어있을 때만)
        gpFrame.paddingTop += outerArea.paddingTop;
        gpFrame.paddingBottom += outerArea.paddingBottom;
        gpFrame.paddingLeft += outerArea.paddingLeft;
        gpFrame.paddingRight += outerArea.paddingRight;
        transferAreaProps(outerArea, gpFrame);
        const kids = [...outerArea.children];
        for (let i = kids.length - 1; i >= 0; i--) gpFrame.insertChild(outerIndex, kids[i]);
        outerArea.remove();
        return ops;
      } else {
        const parentFrame = frame.parent as FrameNode;
        const frameIndex = [...parentFrame.children].indexOf(frame as any);
        ops.push({ op: 'remove-layout', nodeId: parentFrame.id, snap: snapshotFrame(parentFrame) });
        ops.push({ op: 'rewrap-area', parentId: parentFrame.id, insertIndex: frameIndex, snap: snapshotFrame(frame), parentPaddingSnap: { pt: parentFrame.paddingTop, pb: parentFrame.paddingBottom, pl: parentFrame.paddingLeft, pr: parentFrame.paddingRight } });
        parentFrame.paddingTop += frame.paddingTop;
        parentFrame.paddingBottom += frame.paddingBottom;
        parentFrame.paddingLeft += frame.paddingLeft;
        parentFrame.paddingRight += frame.paddingRight;
        transferAreaProps(frame, parentFrame);
        const kids = [...frame.children];
        for (let i = kids.length - 1; i >= 0; i--) parentFrame.insertChild(frameIndex, kids[i]);
        frame.remove();
        return ops;
      }
    }
  }

  // Auto Layout 적용
  if (frame.layoutMode === 'NONE') {
    ops.push({ op: 'remove-layout', nodeId: frame.id, snap: snapshotFrame(frame) });
    applyAutoLayout(frame);
  }

  // Instance 2개 이상이고 모두 동일 컴포넌트일 때만 List로 감싸기
  const instances = children.filter(c => c.type === 'INSTANCE');
  const hasListChild = children.some(c => c.type === 'FRAME' && (c as FrameNode).name === 'List');
  if (instances.length >= 2 && !hasListChild && await isSameComponent(instances as InstanceNode[])) {
    const list = wrapInList(frame, instances);
    ops.push({ op: 'unwrap-list', parentId: frame.id, listId: list.id });
    return ops;
  }

  // 불필요한 wrapper → ungroup (시각 속성도 받는 쪽에 전이, 받는 쪽 snapshot 추가)
  if (frame.parent && frame.parent.type === 'FRAME') {
    const parentFrame = frame.parent as FrameNode;
    if (isStructuralName(parentFrame.name) && !isStructuralName(frame.name)) {
      const frameIndex = [...parentFrame.children].indexOf(frame as any);
      ops.push({ op: 'remove-layout', nodeId: parentFrame.id, snap: snapshotFrame(parentFrame) });
      ops.push({ op: 'rewrap-area', parentId: parentFrame.id, insertIndex: frameIndex, snap: snapshotFrame(frame), parentPaddingSnap: { pt: parentFrame.paddingTop, pb: parentFrame.paddingBottom, pl: parentFrame.paddingLeft, pr: parentFrame.paddingRight } });
      parentFrame.paddingTop += frame.paddingTop;
      parentFrame.paddingBottom += frame.paddingBottom;
      parentFrame.paddingLeft += frame.paddingLeft;
      parentFrame.paddingRight += frame.paddingRight;
      transferAreaProps(frame, parentFrame);
      const kids = [...frame.children];
      for (let i = kids.length - 1; i >= 0; i--) parentFrame.insertChild(frameIndex, kids[i]);
      frame.remove();
    }
  }

  return ops;
}

// ── Screen Structure Check ─────────────────────────────────────────────────

type ScreenSlot = 'header' | 'body' | 'footer' | 'unknown';

function isTopBarName(name: string): boolean {
  return (
    name.includes('top bar') ||
    name.includes('topbar') ||
    name.includes('app bar') ||
    name.includes('appbar') ||
    name.includes('navigation bar') ||
    name.includes('nav bar') ||
    name.includes('toolbar') ||
    name.includes('navigation') ||
    name.includes('top navigation')
  );
}

function isBottomBarName(name: string): boolean {
  return (
    name.includes('bottom') ||
    name.includes('cta') ||
    name.includes('tab bar') ||
    name.includes('tabbar') ||
    name.includes('action bar')
  );
}

function isFooterBottomName(name: string): boolean {
  return name.includes('indicator') || name.includes('keyboard');
}

async function categorizeScreenChild(child: SceneNode): Promise<ScreenSlot> {
  const layerName = child.name.toLowerCase();

  if (layerName === 'header') return 'header';
  if (layerName === 'footer') return 'footer';
  if (layerName.includes('body') && child.type === 'FRAME') return 'body';
  if (layerName.includes('status bar') || layerName.includes('statusbar')) return 'header';
  if (isTopBarName(layerName)) return 'header';
  if (isFooterBottomName(layerName) || isBottomBarName(layerName)) return 'footer';

  if (child.type === 'INSTANCE') {
    const comp = await (child as InstanceNode).getMainComponentAsync();
    const compName = (comp && comp.parent && comp.parent.type === 'COMPONENT_SET'
      ? comp.parent.name
      : comp ? comp.name : child.name
    ).toLowerCase();
    if (isTopBarName(compName) || compName.includes('status bar')) return 'header';
    if (isFooterBottomName(compName) || isBottomBarName(compName)) return 'footer';
  }

  return 'unknown';
}

async function isBottomSheet(node: SceneNode): Promise<boolean> {
  if (node.type !== 'INSTANCE') return false;
  const comp = await (node as InstanceNode).getMainComponentAsync();
  const name = (comp?.parent?.type === 'COMPONENT_SET' ? comp!.parent.name : comp?.name || '').toLowerCase();
  return name.includes('bottom sheet');
}

async function checkBottomSheetSlot(inst: InstanceNode, issues: Issue[]) {
  const children = [...inst.children];
  const frames = children.filter(c => c.type === 'FRAME') as FrameNode[];
  if (frames.length === 0) return;

  // 가장 큰 자식 FRAME = slot의 Body
  const largest = frames.reduce((a, b) => (a.width * a.height >= b.width * b.height ? a : b));

  if (largest.name !== 'Body') {
    issues.push({
      type: 'invalid-screen-structure',
      message: `Bottom Sheet의 slot 안 가장 큰 프레임이 "Body"가 아니에요. 현재 이름: "${largest.name}"`,
      nodeId: largest.id,
      nodeName: largest.name,
    });
  }
}

async function checkScreenStructure(screen: FrameNode, issues: Issue[]) {
  const children = [...screen.children];

  // Bottom Sheet 분리
  const bottomSheets: SceneNode[] = [];
  const normalChildren: SceneNode[] = [];
  for (const child of children) {
    if (await isBottomSheet(child)) {
      bottomSheets.push(child);
    } else {
      normalChildren.push(child);
    }
  }

  // Bottom Sheet slot 검사
  for (const bs of bottomSheets) {
    await checkBottomSheetSlot(bs as InstanceNode, issues);
  }

  // Screen Auto Layout 없음
  if (screen.layoutMode === 'NONE') {
    issues.push({
      type: 'screen-no-autolayout',
      message: `Screen에 Auto Layout이 없어요. Vertical Auto Layout을 적용해야 해요.`,
      nodeId: screen.id,
      nodeName: screen.name || '(이름 없음)',
    });
  }

  // Scroll / Fixed 감지
  if (screen.overflowDirection !== 'NONE' || screen.numberOfFixedChildren > 0) {
    issues.push({
      type: 'screen-scroll',
      message: `Screen에 스크롤(${screen.overflowDirection}) 또는 Fixed 자식(${screen.numberOfFixedChildren}개)이 적용되어 있어요. 해제해야 해요.`,
      nodeId: screen.id,
      nodeName: screen.name || '(이름 없음)',
    });
  }

  // 나머지 children은 기존 screen 구조 규칙 적용
  const SLOT_ORDER: ScreenSlot[] = ['header', 'body', 'footer'];
  const categorized: { node: SceneNode; slot: ScreenSlot }[] = [];
  for (const child of normalChildren) {
    categorized.push({ node: child, slot: await categorizeScreenChild(child) });
  }

  if (!categorized.find(c => c.slot === 'body')) {
    const unknownFrames = categorized.filter(c => c.slot === 'unknown' && c.node.type === 'FRAME');
    if (unknownFrames.length === 1) {
      issues.push({
        type: 'missing-body',
        message: `Body 프레임 이름이 "${unknownFrames[0].node.name}"으로 되어 있어요. "Body"로 수정해야 해요.`,
        nodeId: unknownFrames[0].node.id,
        nodeName: unknownFrames[0].node.name,
      });
    } else {
      issues.push({
        type: 'missing-body',
        message: `Body 프레임이 없어요. Header, Footer를 제외한 레이어를 Body로 묶어야 해요.`,
        nodeId: screen.id,
        nodeName: screen.name || '(이름 없음)',
      });
    }
    return;
  }

  for (const { node } of categorized.filter(c => c.slot === 'unknown')) {
    issues.push({
      type: 'invalid-screen-structure',
      message: `Screen에 허용되지 않은 레이어 "${node.name}"이 있어요.`,
      nodeId: node.id,
      nodeName: node.name || '(이름 없음)',
    });
  }

  const slots = categorized.filter(c => c.slot !== 'unknown').map(c => c.slot);
  let lastIdx = -1;
  let orderViolation = false;
  for (const slot of slots) {
    const idx = SLOT_ORDER.indexOf(slot);
    if (idx < lastIdx) { orderViolation = true; break; }
    lastIdx = idx;
  }
  if (orderViolation) {
    issues.push({
      type: 'invalid-screen-structure',
      message: `Screen 구성 순서가 잘못됐어요. Header → Body → Footer 순서여야 해요.`,
      nodeId: screen.id,
      nodeName: screen.name || '(이름 없음)',
    });
  }

  // Header 내부 순서: Status Bar → Top Bar
  const headerNodes = categorized.filter(c => c.slot === 'header');
  let seenTopBarInHeader = false;
  for (const { node } of headerNodes) {
    const n = node.name.toLowerCase();
    const isTopBar = isTopBarName(n);
    const isStatusBar = n.includes('status bar') || n.includes('statusbar');
    if (isTopBar) seenTopBarInHeader = true;
    if (isStatusBar && seenTopBarInHeader) {
      issues.push({
        type: 'invalid-screen-structure',
        message: `Header 내 순서가 잘못됐어요. Status Bar는 Top Bar 위에 있어야 해요.`,
        nodeId: node.id,
        nodeName: node.name,
      });
      break;
    }
  }

  // Footer 규칙
  const footerNodes = categorized.filter(c => c.slot === 'footer');
  if (footerNodes.length > 0) {
    const indicatorNodes = footerNodes.filter(({ node }) => node.name.toLowerCase().includes('indicator'));
    const keyboardNodes = footerNodes.filter(({ node }) => node.name.toLowerCase().includes('keyboard'));

    // Indicator + Keyboard 공존 불가 → indicator 삭제
    if (indicatorNodes.length > 0 && keyboardNodes.length > 0) {
      for (const { node } of indicatorNodes) {
        issues.push({
          type: 'footer-coexistence',
          message: `Indicator와 Keyboard가 함께 있을 수 없어요. Indicator를 삭제해야 해요.`,
          nodeId: node.id,
          nodeName: node.name,
        });
      }
    }

    // Indicator / Keyboard는 Footer 최하단이어야 함
    const bottomNodes = footerNodes.filter(({ node }) => isFooterBottomName(node.name.toLowerCase()));
    const otherFooterNodes = footerNodes.filter(({ node }) => !isFooterBottomName(node.name.toLowerCase()));
    if (bottomNodes.length > 0 && otherFooterNodes.length > 0) {
      const getIdx = (n: SceneNode) => normalChildren.indexOf(n);
      const lastOtherIdx = Math.max(...otherFooterNodes.map(({ node }) => getIdx(node)));
      const firstBottomIdx = Math.min(...bottomNodes.map(({ node }) => getIdx(node)));
      if (firstBottomIdx < lastOtherIdx) {
        for (const { node } of bottomNodes) {
          issues.push({
            type: 'invalid-screen-structure',
            message: `"${node.name}"은 Footer의 최하단에 위치해야 해요.`,
            nodeId: node.id,
            nodeName: node.name,
          });
        }
      }
    }
  }
}

// ── Validate ───────────────────────────────────────────────────────────────

async function detectEdgeCases(node: SceneNode, issues: Issue[]) {
  if (!node.visible) {
    issues.push({
      type: 'hidden-layer',
      message: `레이어가 숨겨져 있어서 오슬라이스가 내용을 파악할 수 없어요.`,
      nodeId: node.id,
      nodeName: node.name || '(이름 없음)',
    });
    return;
  }

  // INSTANCE에 SLOT(콘텐츠 삽입 영역)이 있으면 그 안의 사용자 콘텐츠는 일반 frame처럼 검증
  // (overlay/modal 컴포넌트의 slot 안에 Body > Areas 구조가 들어가는 패턴 지원)
  // 기존 INSTANCE 자체 검증 로직은 아래에서 그대로 실행되도록 early return하지 않음
  if (node.type === 'INSTANCE') {
    const instance = node as InstanceNode;
    for (const child of instance.children) {
      if ((child.type as string) === 'SLOT') {
        const slotChildren = (child as any).children as SceneNode[] | undefined;
        if (slotChildren && slotChildren.length > 0) {
          for (const slotContent of slotChildren) {
            await detectEdgeCases(slotContent, issues);
          }
        }
      }
    }
  }

  if (node.name.toLowerCase().includes('ignore to autolayout')) return;

  if (node.type === 'FRAME') {
    const frame = node as FrameNode;
    const children = [...frame.children];

    // Screen 구조 검사 (최상위 Frame만)
    if (isScreen(frame)) {
      await checkScreenStructure(frame, issues);
      for (const child of children) await detectEdgeCases(child, issues);
      return;
    }

    // List가 Area 없이 직접 구조 프레임에 있는 경우
    if (
      frame.name === 'List' &&
      frame.parent &&
      frame.parent.type === 'FRAME' &&
      !(frame.parent as FrameNode).name.endsWith('Area')
    ) {
      const firstInst = findFirstInstance(frame);
      const compName = firstInst ? await getCompName(firstInst) : 'Component';
      issues.push({
        type: 'needs-area-wrapper',
        message: `List가 Area 없이 직접 있어요. "${compName} Area"로 감싸야 해요.`,
        nodeId: frame.id,
        nodeName: frame.name,
      });
      return;
    }

    // 중첩 Area 검사 (Area 안에 Area — 직계 부모뿐 아니라 조상 전체 체크)
    if (frame.name.endsWith('Area')) {
      let ancestor = frame.parent;
      let ancestorArea: FrameNode | null = null;
      while (ancestor && (ancestor as any).type !== 'PAGE') {
        if (ancestor.type === 'FRAME' && (ancestor as FrameNode).name.endsWith('Area')) {
          ancestorArea = ancestor as FrameNode;
          break;
        }
        ancestor = (ancestor as any).parent;
      }
      if (ancestorArea) {
        issues.push({
          type: 'nested-area',
          message: `"${ancestorArea.name}" 안에 "${frame.name}"이 중첩되어 있어요. Area는 Area 안에 있을 수 없어요.`,
          nodeId: frame.id,
          nodeName: frame.name || '(이름 없음)',
        });
        for (const child of children) await detectEdgeCases(child, issues);
        return;
      }
    }

    // Body / Canvas에 Area 없이 직접 인스턴스 → Area 그루핑 필요 (Canvas도 Body와 동일 구조 규칙)
    if (frame.name === 'Body' || frame.name === 'Canvas') {
      // 양옆 패딩 0 필수
      if (frame.paddingLeft > 0 || frame.paddingRight > 0) {
        issues.push({
          type: 'body-side-padding',
          message: `${frame.name}의 양옆 패딩(left: ${frame.paddingLeft}px, right: ${frame.paddingRight}px)이 있어요. 0으로 설정해야 해요.`,
          nodeId: frame.id,
          nodeName: frame.name,
        });
      }

      const directInstances = children.filter(c => c.type === 'INSTANCE');
      if (directInstances.length > 0) {
        const absCount = directInstances.filter(c => (c as any).layoutPositioning === 'ABSOLUTE').length;
        const flowCount = directInstances.length - absCount;
        const where = absCount > 0
          ? `(flow ${flowCount}개, absolute ${absCount}개)`
          : `${directInstances.length}개`;
        issues.push({
          type: 'needs-area-grouping',
          message: `${frame.name} 안에 Area 없이 컴포넌트 ${where}가 직접 배치되어 있어요. ${absCount > 0 ? 'absolute 컴포넌트는 각자 Area로 감싸 위치값 보존, flow는 가로 슬라이스 기준으로 그룹핑됩니다.' : '가로 슬라이스 기준으로 Area를 생성해야 해요.'}`,
          nodeId: frame.id,
          nodeName: frame.name,
        });
        for (const child of children) await detectEdgeCases(child, issues);
        return;
      }
    }

    // 상단 패딩 불허: Body 직계 자식(이름 무관) 또는 일반 Area 프레임 (최상단 형제는 제외)
    // → 위 프레임의 하단 패딩으로 이동
    if (
      frame.parent &&
      frame.parent.type === 'FRAME' &&
      frame.paddingTop > 0
    ) {
      const parentFrame = frame.parent as FrameNode;
      const parentIsBody = parentFrame.name === 'Body';
      const frameIsArea = frame.name.endsWith('Area');
      if (parentIsBody || frameIsArea) {
        const siblings = [...parentFrame.children];
        const isFirst = siblings[0].id === frame.id;
        if (!isFirst) {
          issues.push({
            type: 'excess-top-padding',
            message: `상단 패딩(${frame.paddingTop}px)이 있어요. 위 프레임의 하단 패딩으로 이동해야 해요.`,
            nodeId: frame.id,
            nodeName: frame.name,
          });
        }
      }
    }

    // Body 자체의 하단 패딩 64 필수 (+ Body 내 last-child 체인의 어느 FRAME이라도 하단 패딩이 있으면 함께 제거)
    if (frame.name === 'Body') {
      const offending: FrameNode[] = [];
      let cursor: FrameNode = frame;
      while (true) {
        const last = cursor.children[cursor.children.length - 1];
        if (!last || last.type !== 'FRAME') break;
        const lf = last as FrameNode;
        if (lf.paddingBottom > 0) offending.push(lf);
        cursor = lf;
      }
      const bodyBottomWrong = frame.paddingBottom !== 64;
      if (bodyBottomWrong || offending.length > 0) {
        let msg = `Body의 하단 패딩이 ${frame.paddingBottom}px예요. 64px로 설정해야 해요.`;
        if (offending.length > 0) {
          const names = offending.map(f => `"${f.name}"(${f.paddingBottom}px)`).join(', ');
          msg += ` (${names}의 하단 패딩도 함께 제거됩니다.)`;
        }
        issues.push({
          type: 'missing-bottom-padding',
          message: msg,
          nodeId: frame.id,
          nodeName: frame.name,
        });
      }
    }

    // Area / Row / List가 아닌 extra 프레임 감지 (구조적 부모 내부)
    if (
      frame.parent && frame.parent.type === 'FRAME' &&
      isStructuralName((frame.parent as FrameNode).name) &&
      !isStructuralName(frame.name) &&
      children.length > 0
    ) {
      const instanceChildren = children.filter(c => c.type === 'INSTANCE') as InstanceNode[];
      const onlyInstances = instanceChildren.length >= 2 && instanceChildren.length === children.length;
      const isListLike = onlyInstances && await isSameComponent(instanceChildren);

      if (isListLike) {
        // 케이스 B: 같은 컴포넌트 2+개만 → "List"로 rename + "[Comp] Area"로 감싸기 (삭제 X)
        const compName = await getCompName(instanceChildren[0]);
        issues.push({
          type: 'redundant-wrapper',
          message: `"${frame.name}"은 "List"로 이름을 바꾸고, "${compName} Area"로 감싸야 해요.`,
          nodeId: frame.id,
          nodeName: frame.name || '(이름 없음)',
        });
      } else {
        // 케이스 A: computeFrameName이 적절한 이름(예: "Text Button Area")을 계산하면 rename만 (삭제 X)
        //   - 단일 인스턴스 1개
        //   - List 또는 List-like 프레임을 감싼 경우
        //   - 기타 구조에서 Area 이름이 자명한 경우
        const newName = await computeFrameName(frame);
        if (newName && newName !== frame.name) {
          issues.push({
            type: 'redundant-wrapper',
            message: `"${frame.name}"을 "${newName}"로 이름을 바꿔야 해요.`,
            nodeId: frame.id,
            nodeName: frame.name || '(이름 없음)',
          });
        } else {
          // 케이스 C: 진짜 redundant → 기존대로 ungroup
          issues.push({
            type: 'redundant-wrapper',
            message: `"${frame.name}"은 불필요한 extra 프레임이에요. 상위 프레임으로 합쳐야 해요.`,
            nodeId: frame.id,
            nodeName: frame.name || '(이름 없음)',
          });
        }
      }
      for (const child of children) await detectEdgeCases(child, issues);
      return;
    }

    // Auto Layout 없음 (ignore auto layout 제외)
    if (frame.layoutMode === 'NONE' && (frame as any).layoutPositioning !== 'ABSOLUTE') {
      issues.push({
        type: 'no-autolayout',
        message: `Auto Layout이 없어서 방향을 판단할 수 없어요.`,
        nodeId: node.id,
        nodeName: node.name,
      });
    }

    // Instance 2개 이상인데 List wrapper 없음 (no-autolayout 등 다른 issue가 있어도 함께 안내)
    if (frame.parent && (frame.parent as any).type !== 'PAGE') {
      const instances = children.filter(c => c.type === 'INSTANCE');
      const hasListChild = children.some(c => c.type === 'FRAME' && (c as FrameNode).name === 'List');
      const isListOrRow = frame.name === 'List' || frame.name === 'Row';
      if (instances.length >= 2 && !hasListChild && !isListOrRow) {
        if (await isSameComponent(instances as InstanceNode[])) {
          issues.push({
            type: 'needs-list-wrapper',
            message: `Instance ${instances.length}개가 List 없이 직접 포함되어 있어요. List 프레임으로 감싸야 해요.`,
            nodeId: frame.id,
            nodeName: frame.name || '(이름 없음)',
          });
        }
      }
    }

    // 이름 검사 — needs-list-wrapper가 같은 프레임에 있을 때만 suppress
    // (그 경우 rename 대상이 'List'로 잘못 잡힐 수 있어서). 그 외(no-autolayout 등)와는 공존 OK.
    if (frame.parent && (frame.parent as any).type !== 'PAGE') {
      const hasNeedsList = issues.some(i => i.nodeId === frame.id && i.type === 'needs-list-wrapper');
      if (!hasNeedsList) {
        const expectedName = await computeFrameName(frame);
        if (expectedName !== null && expectedName !== frame.name) {
          issues.push({
            type: 'wrong-area-name',
            message: `"${expectedName}"으로 이름을 변경해야 해요.`,
            nodeId: frame.id,
            nodeName: frame.name || '(이름 없음)',
          });
        }
      }
    }

    // 가로 Fill 검사: 부모가 VERTICAL auto-layout일 때만 강제.
    // HORIZONTAL 부모(특히 SPACE_BETWEEN auto gap)에서는 자식이 Hug/Fixed/Fill 등 디자인 의도대로 다양해야 하므로 강제 안 함.
    if (
      frame.parent &&
      frame.parent.type === 'FRAME' &&
      (frame.parent as FrameNode).layoutMode === 'VERTICAL'
    ) {
      const sizing = (frame as any).layoutSizingHorizontal;
      if (sizing !== undefined && sizing !== 'FILL') {
        issues.push({
          type: 'not-fill-horizontal',
          message: `가로 너비가 Fill이 아니에요. Fill로 설정해야 해요.`,
          nodeId: frame.id,
          nodeName: frame.name,
        });
      }
    }

    for (const child of children) await detectEdgeCases(child, issues);
    return;
  }

  if (node.type === 'INSTANCE') {
    const inst = node as InstanceNode;
    // Bottom Sheet는 checkBottomSheetSlot에서 처리
    if (await isBottomSheet(inst)) return;
    const instName = inst.name.toLowerCase();
    if (instName.includes('text')) {
      const instChildren = [...inst.children];
      const onlyText = instChildren.length > 0 && instChildren.every(c => c.type === 'TEXT');
      if (onlyText) {
        const textChild = instChildren[0] as TextNode;
        const boundVars = (textChild as any).boundVariables;
        const hasVar = boundVars && Object.keys(boundVars).length > 0;
        if (!hasVar) {
          issues.push({
            type: 'no-typography-variable',
            message: `Typography variable이 없어서 Title Area / Text Area를 판단할 수 없어요.`,
            nodeId: inst.id,
            nodeName: inst.name || '(이름 없음)',
          });
        }
      }
    }
    return;
  }

  if (node.type === 'TEXT') {
    const textNode = node as TextNode;
    const boundVars = (textNode as any).boundVariables;
    const hasVar = boundVars && Object.keys(boundVars).length > 0;
    if (!hasVar) {
      issues.push({
        type: 'no-typography-variable',
        message: `Typography variable이 없어서 Title Area / Text Area를 판단할 수 없어요.`,
        nodeId: node.id,
        nodeName: node.name || '(이름 없음)',
      });
    }
    if (node.name !== 'Text') {
      issues.push({
        type: 'wrong-layer-name',
        message: `레이어 이름이 "${node.name}"이에요. "Text"로 통일해야 해요.`,
        nodeId: node.id,
        nodeName: node.name || '(이름 없음)',
      });
    }
    return;
  }

  if (node.type === 'RECTANGLE' || node.type === 'ELLIPSE' || node.type === 'VECTOR' ||
      node.type === 'POLYGON' || node.type === 'STAR' || node.type === 'LINE' || node.type === 'BOOLEAN_OPERATION') {
    const expected = getShapeLabel(node as SceneNode);
    if (node.name !== expected) {
      issues.push({
        type: 'wrong-layer-name',
        message: `레이어 이름이 "${node.name}"이에요. "${expected}"으로 통일해야 해요.`,
        nodeId: node.id,
        nodeName: node.name || '(이름 없음)',
      });
    }
    return;
  }
}

async function computeNodeWrapperName(node: SceneNode): Promise<string> {
  if (node.type === 'TEXT') {
    const heading = await isHeadingText(node as TextNode);
    return heading ? 'Title Area' : 'Text Area';
  }
  if (node.type === 'INSTANCE') {
    const inst = node as InstanceNode;
    if (isTextInstance(inst)) {
      const heading = await isHeadingInstance(inst);
      return heading ? 'Title Area' : 'Text Area';
    }
    const compName = await getCompName(inst);
    return compName + ' Area';
  }
  if (['RECTANGLE', 'ELLIPSE', 'VECTOR', 'POLYGON', 'STAR', 'LINE', 'BOOLEAN_OPERATION'].indexOf(node.type) !== -1) {
    return getShapeLabel(node) + ' Area';
  }
  return 'Area';
}

async function fixExcessTopPadding(nodeId: string): Promise<RevertOp[]> {
  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node || node.type !== 'FRAME') throw new Error('노드를 찾을 수 없어요.');
  const frame = node as FrameNode;
  if (!frame.parent || frame.parent.type !== 'FRAME') throw new Error('부모를 찾을 수 없어요.');
  const parentFrame = frame.parent as FrameNode;
  const siblings = [...parentFrame.children];
  const idx = siblings.findIndex(c => c.id === frame.id);
  if (idx <= 0) throw new Error('이전 프레임이 없어요.');
  const prev = siblings[idx - 1];

  const ops: RevertOp[] = [
    { op: 'remove-layout', nodeId: frame.id, snap: snapshotFrame(frame) },
  ];

  let targetFrame: FrameNode;
  if (prev.type === 'FRAME') {
    targetFrame = prev as FrameNode;
    ops.push({ op: 'remove-layout', nodeId: targetFrame.id, snap: snapshotFrame(targetFrame) });
  } else {
    // 이전 노드가 FRAME이 아니면 적절한 Area로 감싼 뒤 그 Area의 하단 패딩에 이동
    const wrapperName = await computeNodeWrapperName(prev);
    const prevIndex = idx - 1;
    const area = figma.createFrame();
    area.name = wrapperName;
    area.fills = [];
    area.clipsContent = false;
    area.layoutMode = parentFrame.layoutMode !== 'NONE' ? parentFrame.layoutMode as 'HORIZONTAL' | 'VERTICAL' : 'VERTICAL';
    area.primaryAxisSizingMode = 'AUTO';
    area.counterAxisSizingMode = 'AUTO';
    area.primaryAxisAlignItems = 'MIN';
    area.counterAxisAlignItems = 'MIN';
    parentFrame.insertChild(prevIndex, area);
    area.appendChild(prev);
    ops.push({ op: 'unwrap-list', parentId: parentFrame.id, listId: area.id });
    targetFrame = area;
  }

  targetFrame.paddingBottom = targetFrame.paddingBottom + frame.paddingTop;
  frame.paddingTop = 0;
  return ops;
}

async function fixScreenAutoLayout(nodeId: string): Promise<RevertOp[]> {
  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node || node.type !== 'FRAME') throw new Error('노드를 찾을 수 없어요.');
  const frame = node as FrameNode;
  const ops: RevertOp[] = [{ op: 'remove-layout', nodeId: frame.id, snap: snapshotFrame(frame) }];
  const children = [...frame.children];
  const withPos = children.map(c => ({ node: c, y: (c as any).y as number }));
  withPos.sort((a, b) => a.y - b.y);
  withPos.forEach((item, i) => frame.insertChild(i, item.node));
  frame.layoutMode = 'VERTICAL';
  frame.primaryAxisSizingMode = 'FIXED';
  frame.counterAxisSizingMode = 'FIXED';
  frame.primaryAxisAlignItems = 'MIN';
  frame.counterAxisAlignItems = 'MIN';
  frame.itemSpacing = 0;
  frame.paddingTop = 0;
  frame.paddingBottom = 0;
  frame.paddingLeft = 0;
  frame.paddingRight = 0;
  return ops;
}

async function fixScreenScroll(nodeId: string): Promise<RevertOp[]> {
  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node || node.type !== 'FRAME') throw new Error('노드를 찾을 수 없어요.');
  const frame = node as FrameNode;
  const ops: RevertOp[] = [{
    op: 'restore-scroll',
    nodeId,
    overflowDirection: frame.overflowDirection,
    numberOfFixedChildren: frame.numberOfFixedChildren,
  }];
  frame.overflowDirection = 'NONE';
  frame.numberOfFixedChildren = 0;
  return ops;
}

async function fixFooterCoexistence(nodeId: string): Promise<RevertOp[]> {
  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node) throw new Error('노드를 찾을 수 없어요.');
  (node as SceneNode).visible = false;
  return [{ op: 'show-node', nodeId }];
}

// ── Fix Handlers ───────────────────────────────────────────────────────────

async function fixMissingBottomPadding(nodeId: string): Promise<RevertOp[]> {
  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node || node.type !== 'FRAME') throw new Error('노드를 찾을 수 없어요.');
  const frame = node as FrameNode;
  const ops: RevertOp[] = [{ op: 'remove-layout', nodeId: frame.id, snap: snapshotFrame(frame) }];
  // Body인 경우: last-child 체인의 모든 FRAME에서 잔여 하단 패딩 제거 → Body 자체에 64 설정
  if (frame.name === 'Body') {
    let cursor: FrameNode = frame;
    while (true) {
      const last = cursor.children[cursor.children.length - 1];
      if (!last || last.type !== 'FRAME') break;
      const lf = last as FrameNode;
      if (lf.paddingBottom > 0) {
        ops.push({ op: 'remove-layout', nodeId: lf.id, snap: snapshotFrame(lf) });
        lf.paddingBottom = 0;
      }
      cursor = lf;
    }
  }
  frame.paddingBottom = 64;
  return ops;
}

async function fixExcessBottomPadding(nodeId: string): Promise<RevertOp[]> {
  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node || node.type !== 'FRAME') throw new Error('노드를 찾을 수 없어요.');
  const frame = node as FrameNode;
  if (!frame.parent || frame.parent.type !== 'FRAME') throw new Error('부모를 찾을 수 없어요.');
  const siblings = [...(frame.parent as FrameNode).children];
  const idx = siblings.findIndex(c => c.id === frame.id);
  if (idx === -1 || idx >= siblings.length - 1) throw new Error('다음 프레임이 없어요.');
  const next = siblings[idx + 1];
  if (next.type !== 'FRAME') throw new Error('다음 노드가 프레임이 아니에요.');
  const nextFrame = next as FrameNode;
  const ops: RevertOp[] = [
    { op: 'remove-layout', nodeId: frame.id, snap: snapshotFrame(frame) },
    { op: 'remove-layout', nodeId: nextFrame.id, snap: snapshotFrame(nextFrame) },
  ];
  nextFrame.paddingTop = nextFrame.paddingTop + frame.paddingBottom;
  frame.paddingBottom = 0;
  return ops;
}

async function fixBodySidePadding(nodeId: string): Promise<RevertOp[]> {
  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node || node.type !== 'FRAME') throw new Error('노드를 찾을 수 없어요.');
  const frame = node as FrameNode;
  const ops: RevertOp[] = [{ op: 'remove-layout', nodeId, snap: snapshotFrame(frame) }];
  frame.paddingLeft = 0;
  frame.paddingRight = 0;
  return ops;
}

async function fixRedundantWrapper(nodeId: string): Promise<RevertOp[]> {
  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node || node.type !== 'FRAME') throw new Error('노드를 찾을 수 없어요.');
  const frame = node as FrameNode;
  if (!frame.parent || frame.parent.type !== 'FRAME') throw new Error('부모를 찾을 수 없어요.');
  const parentFrame = frame.parent as FrameNode;
  const frameChildren = [...frame.children];

  // 특수 케이스 B: 같은 컴포넌트 2개 이상만 담긴 프레임 → "List"로 rename 후 "[Comp] Area"로 감싸기 (삭제 X)
  const instanceChildren = frameChildren.filter(c => c.type === 'INSTANCE') as InstanceNode[];
  const onlyInstances = instanceChildren.length >= 2 && instanceChildren.length === frameChildren.length;
  if (onlyInstances && await isSameComponent(instanceChildren)) {
    const oldName = frame.name;
    const compName = await getCompName(instanceChildren[0]);
    const frameIndex = [...parentFrame.children].indexOf(frame as any);
    const area = figma.createFrame();
    area.name = compName + ' Area';
    area.fills = [];
    area.clipsContent = false;
    area.layoutMode = parentFrame.layoutMode !== 'NONE' ? parentFrame.layoutMode as 'HORIZONTAL' | 'VERTICAL' : 'VERTICAL';
    area.primaryAxisSizingMode = 'AUTO';
    area.counterAxisSizingMode = 'AUTO';
    area.primaryAxisAlignItems = 'MIN';
    area.counterAxisAlignItems = 'MIN';
    parentFrame.insertChild(frameIndex, area);
    frame.name = 'List';
    area.appendChild(frame);
    return [
      { op: 'rename', nodeId: frame.id, name: oldName },
      { op: 'unwrap-list', parentId: parentFrame.id, listId: area.id },
    ];
  }

  // 특수 케이스 A: computeFrameName이 적절한 이름을 계산하면 rename만 (삭제 X)
  //   - 단일 인스턴스, List를 감싼 wrapper, Area로 자명한 구조 등 다양한 케이스 커버
  const computedName = await computeFrameName(frame);
  if (computedName && computedName !== frame.name) {
    const oldName = frame.name;
    frame.name = computedName;
    return [{ op: 'rename', nodeId: frame.id, name: oldName }];
  }

  // 케이스 C: ungroup (children을 부모로 올리고 frame remove). 시각 속성도 전이.
  const frameIndex = [...parentFrame.children].indexOf(frame as any);
  const ops: RevertOp[] = [
    { op: 'remove-layout', nodeId: parentFrame.id, snap: snapshotFrame(parentFrame) },
    {
      op: 'rewrap-area',
      parentId: parentFrame.id,
      insertIndex: frameIndex,
      snap: snapshotFrame(frame),
      parentPaddingSnap: { pt: parentFrame.paddingTop, pb: parentFrame.paddingBottom, pl: parentFrame.paddingLeft, pr: parentFrame.paddingRight },
    },
  ];
  parentFrame.paddingTop += frame.paddingTop;
  parentFrame.paddingBottom += frame.paddingBottom;
  parentFrame.paddingLeft += frame.paddingLeft;
  parentFrame.paddingRight += frame.paddingRight;
  transferAreaProps(frame, parentFrame);
  for (let i = frameChildren.length - 1; i >= 0; i--) parentFrame.insertChild(frameIndex, frameChildren[i]);
  frame.remove();
  return ops;
}

async function fixNotFillHorizontal(nodeId: string): Promise<RevertOp[]> {
  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node || node.type !== 'FRAME') throw new Error('노드를 찾을 수 없어요.');
  const current = (node as any).layoutSizingHorizontal || 'FIXED';
  (node as any).layoutSizingHorizontal = 'FILL';
  return [{ op: 'restore-horizontal-sizing', nodeId, layoutSizingHorizontal: current }];
}

async function fixWrongAreaName(nodeId: string): Promise<RevertOp[]> {
  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node) throw new Error('노드를 찾을 수 없어요.');
  const sceneNode = node as SceneNode;
  const oldName = sceneNode.name;
  if (node.type === 'TEXT') {
    sceneNode.name = 'Text';
    return [{ op: 'rename', nodeId, name: oldName }];
  }
  const shapeTypes = ['RECTANGLE', 'ELLIPSE', 'VECTOR', 'POLYGON', 'STAR', 'LINE', 'BOOLEAN_OPERATION'];
  if (shapeTypes.includes(node.type)) {
    sceneNode.name = getShapeLabel(sceneNode);
    return [{ op: 'rename', nodeId, name: oldName }];
  }
  if (node.type !== 'FRAME') throw new Error('노드를 찾을 수 없어요.');
  const frame = node as FrameNode;
  const newName = await computeFrameName(frame);
  if (newName) frame.name = newName;
  return [{ op: 'rename', nodeId, name: oldName }];
}

// ── Node Tree & Claude ─────────────────────────────────────────────────────

async function extractNodeTree(node: SceneNode): Promise<object> {
  const base: any = {
    id: node.id,
    name: node.name,
    type: node.type,
    visible: node.visible,
  };

  if (node.type === 'FRAME') {
    const frame = node as FrameNode;
    base.layoutMode = frame.layoutMode;
    base.children = await Promise.all(frame.children.map(child => extractNodeTree(child)));
  }

  if (node.type === 'INSTANCE') {
    const instance = node as InstanceNode;
    base.componentName = await getCompName(instance);
    base.children = await Promise.all(instance.children.map(child => extractNodeTree(child)));
  }

  if (node.type === 'TEXT') {
    const textNode = node as TextNode;
    base.characters = textNode.characters;
    const boundVars = (textNode as any).boundVariables;
    if (boundVars) base.boundVariables = boundVars;
  }

  return base;
}

// ── Message Handler ────────────────────────────────────────────────────────

figma.ui.onmessage = async (msg: { type: string; nodeId?: string; issueType?: string }) => {
  // 문서를 변경하는 조작은 시각을 기록 → 직후의 selectionchange를 내부 조작으로 판별
  if (['fix-naming', 'fix-structure', 'fix-all-structure', 'fix-all-naming', 'revert', 'delete-node', 'confirm-delete', 'apply-mapping'].indexOf(msg.type) !== -1) {
    lastMutationAt = Date.now();
  }

  if (msg.type === 'validate') {
    try {
      const selection = figma.currentPage.selection;
      if (selection.length !== 1 || (selection[0].type !== 'FRAME' && selection[0].type !== 'COMPONENT' && selection[0].type !== 'COMPONENT_SET')) {
        figma.ui.postMessage({ type: 'no-selection-error', reason: selection.length > 1 ? 'multi' : 'none' });
        return;
      }
      lastValidatedId = selection[0].id;
      const issues: Issue[] = [];
      await detectEdgeCases(selection[0], issues);
      figma.ui.postMessage({ type: 'validate-result', issues });
    } catch (e: any) {
      console.error('[O!Slice] Validate error:', e);
      figma.ui.postMessage({ type: 'error', message: `Validate 오류: ${e.message}` });
    }
  }

  if (msg.type === 'fix-naming' && msg.nodeId) {
    figma.ui.postMessage({ type: 'rebuild-loading', nodeId: msg.nodeId });
    try {
      const revertOps = await fixWrongAreaName(msg.nodeId);
      figma.ui.postMessage({ type: 'rebuild-done', nodeId: msg.nodeId, revertOps });
    } catch (e: any) {
      console.error('[O!Slice] Fix naming error:', e);
      figma.ui.postMessage({ type: 'rebuild-error', nodeId: msg.nodeId, message: e.message });
    }
  }

  if (msg.type === 'fix-structure' && msg.nodeId) {
    figma.ui.postMessage({ type: 'rebuild-loading', nodeId: msg.nodeId });
    try {
      const issueType = (msg as any).issueType as string | undefined;
      const revertOps = issueType === 'needs-area-grouping'
        ? await applyAreaGroupingById(msg.nodeId)
        : issueType === 'missing-bottom-padding'
        ? await fixMissingBottomPadding(msg.nodeId)
        : issueType === 'excess-top-padding'
        ? await fixExcessTopPadding(msg.nodeId)
        : issueType === 'footer-coexistence'
        ? await fixFooterCoexistence(msg.nodeId)
        : issueType === 'screen-scroll'
        ? await fixScreenScroll(msg.nodeId)
        : issueType === 'screen-no-autolayout'
        ? await fixScreenAutoLayout(msg.nodeId)
        : issueType === 'not-fill-horizontal'
        ? await fixNotFillHorizontal(msg.nodeId)
        : issueType === 'redundant-wrapper'
        ? await fixRedundantWrapper(msg.nodeId)
        : issueType === 'body-side-padding'
        ? await fixBodySidePadding(msg.nodeId)
        : await applyStructureFix(msg.nodeId);
      figma.ui.postMessage({ type: 'rebuild-done', nodeId: msg.nodeId, revertOps });
    } catch (e: any) {
      console.error('[O!Slice] Fix structure error:', e);
      figma.ui.postMessage({ type: 'rebuild-error', nodeId: msg.nodeId, message: e.message });
    }
  }

  if (msg.type === 'fix-all-structure' && (msg as any).items) {
    const items: { nodeId: string; issueType: string }[] = (msg as any).items;
    for (const item of items) {
      figma.ui.postMessage({ type: 'rebuild-loading', nodeId: item.nodeId });
      try {
        const revertOps = item.issueType === 'needs-area-grouping'
          ? await applyAreaGroupingById(item.nodeId)
          : item.issueType === 'missing-bottom-padding'
          ? await fixMissingBottomPadding(item.nodeId)
          : item.issueType === 'excess-top-padding'
          ? await fixExcessTopPadding(item.nodeId)
          : item.issueType === 'footer-coexistence'
          ? await fixFooterCoexistence(item.nodeId)
          : item.issueType === 'screen-scroll'
          ? await fixScreenScroll(item.nodeId)
          : item.issueType === 'screen-no-autolayout'
          ? await fixScreenAutoLayout(item.nodeId)
          : item.issueType === 'not-fill-horizontal'
          ? await fixNotFillHorizontal(item.nodeId)
          : item.issueType === 'redundant-wrapper'
          ? await fixRedundantWrapper(item.nodeId)
          : item.issueType === 'body-side-padding'
          ? await fixBodySidePadding(item.nodeId)
          : await applyStructureFix(item.nodeId);
        figma.ui.postMessage({ type: 'rebuild-done', nodeId: item.nodeId, revertOps });
      } catch (e: any) {
        figma.ui.postMessage({ type: 'rebuild-error', nodeId: item.nodeId, message: e.message });
      }
    }
    figma.ui.postMessage({ type: 'fix-all-done' });
  }

  if (msg.type === 'fix-all-naming' && (msg as any).nodeIds) {
    const nodeIds: string[] = (msg as any).nodeIds;
    for (const nodeId of nodeIds) {
      figma.ui.postMessage({ type: 'rebuild-loading', nodeId });
      try {
        const revertOps = await fixWrongAreaName(nodeId);
        figma.ui.postMessage({ type: 'rebuild-done', nodeId, revertOps });
      } catch (e: any) {
        figma.ui.postMessage({ type: 'rebuild-error', nodeId, message: e.message });
      }
    }
    figma.ui.postMessage({ type: 'fix-all-done' });
  }

  if (msg.type === 'revert' && (msg as any).revertOps) {
    try {
      await applyRevert((msg as any).revertOps);
      figma.ui.postMessage({ type: 'revert-done', nodeId: msg.nodeId });
    } catch (e: any) {
      console.error('[O!Slice] Revert error:', e);
      figma.ui.postMessage({ type: 'rebuild-error', nodeId: msg.nodeId, message: `원복 오류: ${e.message}` });
    }
  }

  if (msg.type === 'delete-node' && msg.nodeId) {
    try {
      const node = await figma.getNodeByIdAsync(msg.nodeId);
      if (node) {
        const sceneNode = node as SceneNode;
        if (!sceneNode.visible) {
          // 이미 숨겨진 노드(hidden-layer)는 바로 제거 (FRAME에 콘텐츠 있으면 ungroup)
          removeOrUngroup(sceneNode);
          figma.ui.postMessage({ type: 'delete-done', nodeId: msg.nodeId, revertOps: [] });
        } else {
          pluginSelecting = true;
          sceneNode.visible = false;
          pluginSelecting = false;
          const revertOps: RevertOp[] = [{ op: 'show-node', nodeId: msg.nodeId }];
          figma.ui.postMessage({ type: 'delete-done', nodeId: msg.nodeId, revertOps });
        }
      }
    } catch (e: any) {
      pluginSelecting = false;
      console.error('[O!Slice] Delete error:', e);
      figma.ui.postMessage({ type: 'error', message: `삭제 오류: ${e.message}` });
    }
  }

  if (msg.type === 'confirm-delete' && msg.nodeId) {
    try {
      pluginSelecting = true;
      const node = await figma.getNodeByIdAsync(msg.nodeId);
      if (node) removeOrUngroup(node as SceneNode);
      pluginSelecting = false;
    } catch (_) {
      pluginSelecting = false;
    }
  }

  if (msg.type === 'save-known' && (msg as any).knownIds) {
    await figma.clientStorage.setAsync('knownIssues', (msg as any).knownIds);
  }

  if (msg.type === 'select-node' && msg.nodeId) {
    try {
      const node = await figma.getNodeByIdAsync(msg.nodeId) as SceneNode;
      if (node && !node.removed && node.visible) {
        pluginSelecting = true;
        figma.currentPage.selection = [node];
        figma.viewport.scrollAndZoomIntoView([node]);
        pluginSelecting = false;
      }
    } catch (_) {}
  }

  if (msg.type === 'generate-html') {
    try {
      if (!lastValidatedId) {
        figma.ui.postMessage({ type: 'html-result', html: '검증된 프레임이 없어요. 먼저 Validate를 실행해주세요.' });
        return;
      }
      const node = await figma.getNodeByIdAsync(lastValidatedId);
      if (!node || (node.type !== 'FRAME' && node.type !== 'COMPONENT' && node.type !== 'COMPONENT_SET')) {
        figma.ui.postMessage({ type: 'html-result', html: '프레임을 찾을 수 없어요.' });
        return;
      }
      const html = await nodeToHtml(node as SceneNode, 0, true);
      const screenshot = await exportAsBase64Png(node as SceneNode);
      figma.ui.postMessage({ type: 'html-result', html, screenshot, nodeName: node.name });
    } catch (e: any) {
      console.error('[O!Slice] Generate HTML error:', e);
      figma.ui.postMessage({ type: 'html-error', message: e.message });
    }
  }

  if (msg.type === 'get-mapping') {
    try {
      const sel = figma.currentPage.selection;
      const validFrames = sel.filter(n => n.type === 'FRAME' || n.type === 'COMPONENT' || n.type === 'COMPONENT_SET');
      if (validFrames.length !== 1) {
        figma.ui.postMessage({ type: 'current-mapping', pageId: '', pageName: '' });
        return;
      }
      const node = validFrames[0];
      figma.ui.postMessage({
        type: 'current-mapping',
        pageId: node.getPluginData('logCenterPageId') || '',
        pageName: node.getPluginData('logCenterPageName') || '',
      });
    } catch (_e) {
      figma.ui.postMessage({ type: 'current-mapping', pageId: '', pageName: '' });
    }
  }

  if (msg.type === 'scan-suffixes') {
    try {
      const suffixSet = new Set<string>();
      // ^PAGE_ID(_한글suffix)?(_숫자)?$ 패턴에서 한글 suffix만 추출
      const re = /^[A-Z][A-Z0-9_]*?_([가-힣][ㄱ-㆏가-힣_0-9]*?)(?:_\d+)?$/;
      // 파일 내 모든 페이지의 top-level 프레임을 스캔 → 파일 어디서든 프레임 삭제하면 다음 모달에서 즉시 자동완성에서도 사라짐
      try { await figma.loadAllPagesAsync(); } catch (_e) { /* dynamic-page 미지원이면 무시 */ }
      for (const page of figma.root.children) {
        if (page.type !== 'PAGE') continue;
        for (const frame of page.children) {
          if (frame.type !== 'FRAME' && frame.type !== 'COMPONENT' && frame.type !== 'COMPONENT_SET') continue;
          const m = frame.name.match(re);
          if (m && m[1]) {
            const cleaned = m[1].replace(/_\d+$/, '');
            if (cleaned) suffixSet.add(cleaned.normalize('NFC'));
          }
        }
      }
      figma.ui.postMessage({ type: 'suffix-suggestions', suggestions: Array.from(suffixSet).sort() });
    } catch (_e) {
      figma.ui.postMessage({ type: 'suffix-suggestions', suggestions: [] });
    }
  }

  if (msg.type === 'apply-mapping' && (msg as any).pageId) {
    try {
      const sel = figma.currentPage.selection;
      const validFrames = sel.filter(n => n.type === 'FRAME' || n.type === 'COMPONENT' || n.type === 'COMPONENT_SET');
      if (validFrames.length === 0) {
        figma.ui.postMessage({ type: 'mapping-error', message: 'Screen 또는 Frame을 먼저 선택해주세요.' });
        return;
      }
      const sortedFrames = readingOrderSort(validFrames);
      const pageId = String((msg as any).pageId);
      const pageName = String((msg as any).pageName || pageId);
      const rawSuffix = String((msg as any).suffix || '').normalize('NFC').trim();
      const perFrameRaw: any[] = Array.isArray((msg as any).perFrameSuffixes) ? (msg as any).perFrameSuffixes : [];
      const perFrameSuffixes: string[] = perFrameRaw.map(s => String(s || '').normalize('NFC').trim());
      const base = rawSuffix ? `${pageId}_${rawSuffix}` : pageId;
      const isMulti = sortedFrames.length > 1;
      const appliedNames: string[] = [];
      for (let i = 0; i < sortedFrames.length; i++) {
        const node = sortedFrames[i];
        const perFrame = perFrameSuffixes[i] || '';
        let name: string;
        if (perFrame) {
          // 프레임별 상세가 있으면 적용
          name = `${base}_${perFrame}`;
        } else if (isMulti) {
          // 비어있으면 _N fallback
          name = `${base}_${i + 1}`;
        } else {
          // 단일 프레임
          name = base;
        }
        (node as FrameNode).name = name;
        node.setPluginData('logCenterPageId', pageId);
        node.setPluginData('logCenterPageName', pageName);
        if (rawSuffix) node.setPluginData('frameSuffix', rawSuffix);
        appliedNames.push(name);
      }
      // (clientStorage 누적은 더 이상 사용하지 않음. 프레임에서 지운 suffix가 추천에 계속 뜨는 문제가 있어서, 현재 파일 스캔 + 시드만 사용.)
      figma.ui.postMessage({
        type: 'mapping-applied',
        pageId,
        pageName,
        frameName: appliedNames[0],
        appliedCount: sortedFrames.length,
        appliedNames,
      });
    } catch (e: any) {
      figma.ui.postMessage({ type: 'mapping-error', message: `맵핑 오류: ${e.message}` });
    }
  }

  if (msg.type === 'cancel') {
    figma.closePlugin();
  }
};

function rgbaFromPaint(paint: Paint): string | null {
  if (paint.visible === false) return null;
  if (paint.type === 'SOLID') {
    const c = paint.color;
    const a = paint.opacity ?? 1;
    return `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, ${a})`;
  }
  if (paint.type === 'GRADIENT_LINEAR') {
    const stops = paint.gradientStops.map(s =>
      `rgba(${Math.round(s.color.r * 255)}, ${Math.round(s.color.g * 255)}, ${Math.round(s.color.b * 255)}, ${s.color.a}) ${Math.round(s.position * 100)}%`
    ).join(', ');
    return `linear-gradient(180deg, ${stops})`;
  }
  return null;
}

function getBackground(node: SceneNode): string | null {
  const fills = (node as any).fills;
  if (!Array.isArray(fills)) return null;
  for (const f of fills) {
    const c = rgbaFromPaint(f);
    if (c) return c;
  }
  return null;
}

function getTextColor(textNode: TextNode): string {
  const fills = textNode.fills as readonly Paint[] | typeof figma.mixed;
  if (!Array.isArray(fills)) return '#000';
  for (const f of fills) {
    const c = rgbaFromPaint(f);
    if (c) return c;
  }
  return '#000';
}

function applySizing(styles: string[], node: SceneNode, isRoot: boolean) {
  const parentLayoutMode = node.parent && (node.parent as any).layoutMode;
  const sizeH = (node as any).layoutSizingHorizontal;
  const sizeV = (node as any).layoutSizingVertical;
  const w = Math.round((node as any).width || 0);
  const h = Math.round((node as any).height || 0);
  const isAbsolute = (node as any).layoutPositioning === 'ABSOLUTE' || parentLayoutMode === 'NONE';

  if (isRoot) {
    styles.push(`width: ${w}px`);
    styles.push(`min-height: ${h}px`);
    styles.push('position: relative');
    return;
  }

  if (isAbsolute) {
    styles.push('position: absolute');
    const x = Math.round((node as any).x || 0);
    const y = Math.round((node as any).y || 0);
    styles.push(`left: ${x}px`);
    styles.push(`top: ${y}px`);
    styles.push(`width: ${w}px`);
    styles.push(`height: ${h}px`);
    return;
  }

  // absolute 자식이 있으면 정확한 위치 기준점을 위해 명시적 크기 강제
  const hasAbsoluteKids = ((node as any).children || []).some(
    (c: any) => c && c.layoutPositioning === 'ABSOLUTE'
  );

  if (sizeH === 'FILL') {
    if (parentLayoutMode === 'HORIZONTAL') {
      styles.push('flex: 1 1 0');
      styles.push('min-width: 0');
    } else {
      styles.push('align-self: stretch');
    }
    if (hasAbsoluteKids) styles.push(`min-width: ${w}px`);
  } else if (sizeH === 'FIXED') {
    styles.push(`width: ${w}px`);
    styles.push('flex-shrink: 0');
  } else if (hasAbsoluteKids) {
    styles.push(`width: ${w}px`);
    styles.push('flex-shrink: 0');
  }

  if (sizeV === 'FILL') {
    if (parentLayoutMode === 'VERTICAL') {
      styles.push('flex: 1 1 0');
      styles.push('min-height: 0');
    } else if (parentLayoutMode === 'HORIZONTAL') {
      styles.push('align-self: stretch');
    }
    if (hasAbsoluteKids) styles.push(`min-height: ${h}px`);
  } else if (sizeV === 'FIXED') {
    styles.push(`height: ${h}px`);
  } else if (hasAbsoluteKids) {
    styles.push(`height: ${h}px`);
  }
}

function frameHasAbsoluteChildren(frame: FrameNode): boolean {
  if (frame.layoutMode === 'NONE' && frame.children.length > 0) return true;
  return frame.children.some(c => (c as any).layoutPositioning === 'ABSOLUTE');
}

function applyBorderRadius(styles: string[], node: SceneNode) {
  const radius = (node as any).cornerRadius;
  if (typeof radius === 'number' && radius > 0) {
    styles.push(`border-radius: ${radius}px`);
  } else if (typeof radius !== 'number') {
    const tl = (node as any).topLeftRadius || 0;
    const tr = (node as any).topRightRadius || 0;
    const br = (node as any).bottomRightRadius || 0;
    const bl = (node as any).bottomLeftRadius || 0;
    if (tl || tr || br || bl) styles.push(`border-radius: ${tl}px ${tr}px ${br}px ${bl}px`);
  }
}

function applyEffects(styles: string[], node: SceneNode) {
  const effects = (node as any).effects as readonly Effect[] | undefined;
  if (!Array.isArray(effects) || effects.length === 0) return;
  const shadows: string[] = [];
  const filters: string[] = [];
  const backdropFilters: string[] = [];
  for (const e of effects) {
    if ((e as any).visible === false) continue;
    if (e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW') {
      const c = e.color;
      const rgba = `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, ${c.a})`;
      const inset = e.type === 'INNER_SHADOW' ? 'inset ' : '';
      const spread = (e as any).spread || 0;
      shadows.push(`${inset}${e.offset.x}px ${e.offset.y}px ${e.radius}px ${spread}px ${rgba}`);
    } else if (e.type === 'LAYER_BLUR') {
      filters.push(`blur(${e.radius}px)`);
    } else if (e.type === 'BACKGROUND_BLUR') {
      backdropFilters.push(`blur(${e.radius}px)`);
    }
  }
  if (shadows.length) styles.push(`box-shadow: ${shadows.join(', ')}`);
  if (filters.length) styles.push(`filter: ${filters.join(' ')}`);
  if (backdropFilters.length) {
    styles.push(`backdrop-filter: ${backdropFilters.join(' ')}`);
    styles.push(`-webkit-backdrop-filter: ${backdropFilters.join(' ')}`);
  }
}

function applyOpacity(styles: string[], node: SceneNode) {
  const op = (node as any).opacity;
  if (typeof op === 'number' && op < 1) styles.push(`opacity: ${op}`);
}

function applyStroke(styles: string[], node: SceneNode) {
  const strokes = (node as any).strokes;
  if (!Array.isArray(strokes) || strokes.length === 0) return;
  const sc = rgbaFromPaint(strokes[0]);
  const sw = (node as any).strokeWeight;
  if (!sc || typeof sw !== 'number' || sw <= 0) return;

  const align = (node as any).strokeAlign;
  if (align === 'OUTSIDE') {
    styles.push(`box-shadow: 0 0 0 ${sw}px ${sc}`);
  } else if (align === 'INSIDE') {
    styles.push(`box-shadow: inset 0 0 0 ${sw}px ${sc}`);
  } else {
    styles.push(`border: ${sw}px solid ${sc}`);
  }
}

function buildFrameStyles(frame: FrameNode, isRoot: boolean): string {
  const styles: string[] = [];

  if (frame.layoutMode !== 'NONE') {
    styles.push('display: flex');
    styles.push(`flex-direction: ${frame.layoutMode === 'HORIZONTAL' ? 'row' : 'column'}`);
    if (frame.itemSpacing) styles.push(`gap: ${frame.itemSpacing}px`);
    const justifyMap: Record<string, string> = { MIN: 'flex-start', CENTER: 'center', MAX: 'flex-end', SPACE_BETWEEN: 'space-between' };
    const alignMap: Record<string, string> = { MIN: 'flex-start', CENTER: 'center', MAX: 'flex-end', BASELINE: 'baseline' };
    const j = justifyMap[frame.primaryAxisAlignItems];
    const a = alignMap[frame.counterAxisAlignItems];
    if (j) styles.push(`justify-content: ${j}`);
    if (a) styles.push(`align-items: ${a}`);
    if ((frame as any).layoutWrap === 'WRAP') styles.push('flex-wrap: wrap');
  }

  if (frame.paddingTop) styles.push(`padding-top: ${frame.paddingTop}px`);
  if (frame.paddingRight) styles.push(`padding-right: ${frame.paddingRight}px`);
  if (frame.paddingBottom) styles.push(`padding-bottom: ${frame.paddingBottom}px`);
  if (frame.paddingLeft) styles.push(`padding-left: ${frame.paddingLeft}px`);

  applySizing(styles, frame, isRoot);

  if (!isRoot && frameHasAbsoluteChildren(frame) && !styles.some(s => s.startsWith('position:'))) {
    styles.push('position: relative');
  }

  const bg = getBackground(frame);
  if (bg) {
    if (bg.startsWith('linear-gradient')) styles.push(`background: ${bg}`);
    else styles.push(`background-color: ${bg}`);
  }

  applyBorderRadius(styles, frame);
  applyStroke(styles, frame);
  applyOpacity(styles, frame);
  applyEffects(styles, frame);

  if (frame.clipsContent) styles.push('overflow: hidden');

  return styles.join('; ');
}

function buildTextStyles(textNode: TextNode): string {
  const styles: string[] = [];

  const fontSize = textNode.fontSize;
  if (typeof fontSize === 'number') styles.push(`font-size: ${fontSize}px`);

  const fontName = textNode.fontName;
  if (fontName && typeof fontName === 'object' && 'family' in fontName) {
    const familyList = fontName.family === 'Pretendard'
      ? `'Pretendard', 'Apple SD Gothic Neo', -apple-system, sans-serif`
      : `'${fontName.family}', 'Pretendard', 'Apple SD Gothic Neo', -apple-system, sans-serif`;
    styles.push(`font-family: ${familyList}`);
    const style = fontName.style.toLowerCase();
    if (style.includes('black')) styles.push('font-weight: 900');
    else if (style.includes('extrabold')) styles.push('font-weight: 800');
    else if (style.includes('bold')) styles.push('font-weight: 700');
    else if (style.includes('semibold') || style.includes('semi bold')) styles.push('font-weight: 600');
    else if (style.includes('medium')) styles.push('font-weight: 500');
    else if (style.includes('light')) styles.push('font-weight: 300');
    else if (style.includes('thin')) styles.push('font-weight: 100');
    if (style.includes('italic')) styles.push('font-style: italic');
  }

  const lh = textNode.lineHeight;
  if (lh && typeof lh === 'object') {
    if (lh.unit === 'PIXELS') styles.push(`line-height: ${lh.value}px`);
    else if (lh.unit === 'PERCENT') styles.push(`line-height: ${lh.value}%`);
  }

  const ls = textNode.letterSpacing;
  if (ls && typeof ls === 'object' && ls.unit === 'PIXELS' && ls.value !== 0) {
    styles.push(`letter-spacing: ${ls.value}px`);
  }

  styles.push(`color: ${getTextColor(textNode)}`);

  const alignMap: Record<string, string> = { LEFT: 'left', CENTER: 'center', RIGHT: 'right', JUSTIFIED: 'justify' };
  const ta = alignMap[textNode.textAlignHorizontal];
  if (ta && ta !== 'left') styles.push(`text-align: ${ta}`);

  const tc = (textNode as any).textCase;
  if (tc === 'UPPER') styles.push('text-transform: uppercase');
  else if (tc === 'LOWER') styles.push('text-transform: lowercase');
  else if (tc === 'TITLE') styles.push('text-transform: capitalize');

  const td = (textNode as any).textDecoration;
  if (td === 'UNDERLINE') styles.push('text-decoration: underline');
  else if (td === 'STRIKETHROUGH') styles.push('text-decoration: line-through');

  applySizing(styles, textNode, false);
  applyOpacity(styles, textNode);

  styles.push('margin: 0');

  const truncation = (textNode as any).textTruncation;
  const maxLines = (textNode as any).maxLines;
  if (truncation === 'ENDING') {
    styles.push('overflow: hidden');
    if (typeof maxLines === 'number' && maxLines > 1) {
      styles.push('display: -webkit-box');
      styles.push(`-webkit-line-clamp: ${maxLines}`);
      styles.push('line-clamp: ' + maxLines);
      styles.push('-webkit-box-orient: vertical');
    } else {
      styles.push('text-overflow: ellipsis');
      styles.push('white-space: nowrap');
    }
  } else {
    styles.push('white-space: pre-wrap');
  }

  return styles.join('; ');
}

function buildShapeStyles(node: SceneNode): string {
  const styles: string[] = [];
  applySizing(styles, node, false);

  const bg = getBackground(node);
  if (bg) {
    if (bg.startsWith('linear-gradient')) styles.push(`background: ${bg}`);
    else styles.push(`background-color: ${bg}`);
  }

  if (node.type === 'ELLIPSE') styles.push('border-radius: 50%');
  else applyBorderRadius(styles, node);

  applyStroke(styles, node);
  applyOpacity(styles, node);
  applyEffects(styles, node);

  return styles.join('; ');
}

function hasImageFill(node: SceneNode): boolean {
  const fills = (node as any).fills;
  if (!Array.isArray(fills)) return false;
  return fills.some((f: Paint) => f.type === 'IMAGE' && f.visible !== false);
}

function isIconNode(node: SceneNode): boolean {
  if (node.type === 'VECTOR' || node.type === 'POLYGON' || node.type === 'STAR' ||
      node.type === 'LINE' || node.type === 'BOOLEAN_OPERATION') return true;
  return false;
}

async function exportAsBase64Png(node: SceneNode): Promise<string> {
  try {
    const bytes = await (node as any).exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 1 } });
    const base64 = (figma as any).base64Encode(bytes);
    return `data:image/png;base64,${base64}`;
  } catch (_) {
    return '';
  }
}

async function isIconInstance(inst: InstanceNode): Promise<boolean> {
  const compName = await getCompName(inst);
  if (compName === 'Icon' || compName === 'Img' || compName === 'GIF' || compName === 'Asset') return true;
  if (/^icon$/i.test(inst.name) || /^img$/i.test(inst.name) || /^asset$/i.test(inst.name)) return true;
  return false;
}

function normalizeIconName(name: string): string {
  return name.toLowerCase().trim()
    .replace(/[\u{1F000}-\u{1FFFF}]|[\u{2600}-\u{27BF}]/gu, '')
    .replace(/\[[^\]]+\]/g, '')
    .replace(/[\s\-/]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

async function getIconCandidates(inst: InstanceNode): Promise<string[]> {
  const candidates: string[] = [];
  const push = (s: string) => {
    const n = normalizeIconName(s);
    if (n && !candidates.includes(n)) candidates.push(n);
  };

  let baseName = '';
  try {
    const main = await inst.getMainComponentAsync();
    if (main) {
      if (main.parent && main.parent.type === 'COMPONENT_SET') {
        baseName = normalizeIconName(main.parent.name);
      } else {
        baseName = normalizeIconName(main.name);
      }
    }
  } catch (_) {}
  if (!baseName) baseName = normalizeIconName(inst.name);

  const variantValues: string[] = [];
  const props = (inst as any).componentProperties;
  if (props) {
    for (const key of Object.keys(props)) {
      const p = props[key];
      if (p && typeof p.value === 'string') {
        const v = normalizeIconName(p.value);
        if (v) variantValues.push(v);
      }
    }
  }

  if (baseName) {
    for (const v of variantValues) {
      push(`${baseName}_${v}`);
      push(`${v}_${baseName}`);
    }
    push(baseName);
  }

  for (const v of variantValues) push(v);
  push(inst.name);
  return candidates;
}

function getImageObjectFit(node: SceneNode): string {
  const fills = (node as any).fills;
  if (!Array.isArray(fills)) return 'cover';
  for (const f of fills) {
    if (f.type === 'IMAGE') {
      const sm = f.scaleMode;
      if (sm === 'FIT') return 'contain';
      if (sm === 'FILL') return 'cover';
      if (sm === 'CROP') return 'cover';
      if (sm === 'TILE') return 'none';
    }
  }
  return 'cover';
}

async function renderAsImage(node: SceneNode, indent: string): Promise<string> {
  const w = Math.round((node as any).width || 0);
  const h = Math.round((node as any).height || 0);
  const src = await exportAsBase64Png(node);
  if (!src) {
    return `${indent}<div style="width:${w}px;height:${h}px;background:#f5f5f5;border:1px dashed #ccc;display:flex;align-items:center;justify-content:center;color:#999;font-size:10px;flex-shrink:0;">[${escapeHtmlChars(node.name)}]</div>\n`;
  }
  const styles: string[] = [];
  applySizing(styles, node, false);
  if (!styles.some(s => s.startsWith('width:') || s.startsWith('flex:'))) {
    styles.push(`width: ${w}px`);
    styles.push('flex-shrink: 0');
  }
  if (!styles.some(s => s.startsWith('height:'))) {
    styles.push(`height: ${h}px`);
  }
  styles.push(`object-fit: ${getImageObjectFit(node)}`);
  styles.push('display: block');
  applyBorderRadius(styles, node);
  applyOpacity(styles, node);
  applyEffects(styles, node);
  return `${indent}<img src="${src}" style="${styles.join('; ')}" alt="" />\n`;
}

async function nodeToHtml(node: SceneNode, depth: number, isRoot: boolean = false): Promise<string> {
  const indent = '  '.repeat(depth);
  if (!node.visible) return '';

  if (node.type === 'TEXT') {
    const t = node as TextNode;
    const isHeading = await isHeadingText(t);
    const tag = isHeading ? 'h2' : 'p';
    const text = escapeHtmlChars(t.characters || '');
    const style = buildTextStyles(t);
    return `${indent}<${tag} style="${style}">${text}</${tag}>\n`;
  }

  if (node.type === 'INSTANCE') {
    const inst = node as InstanceNode;

    const template = await findTemplate(inst);
    if (template) {
      const props = getInstancePropsSync(inst);
      let childrenHtml = '';
      for (const child of inst.children) {
        childrenHtml += await nodeToHtml(child, depth + 1);
      }
      const body = pickTemplateBody(template, props);
      const rendered = resolveTemplate(body, props, childrenHtml.trim());
      console.log('[O!Slice] Render', template.componentName, '| props=', JSON.stringify(props), '| body.len=', body.length, '| rendered.len=', rendered.length);
      console.log('[O!Slice] Render preview:', rendered.slice(0, 300));
      const sizingStyles: string[] = [];
      applySizing(sizingStyles, node, false);
      const wrapStyle = sizingStyles.length > 0 ? ` style="${sizingStyles.join('; ')}"` : '';
      return `${indent}<div${wrapStyle}>\n${rendered}\n${indent}</div>\n`;
    }

    if (await isIconInstance(inst)) {
      const candidates = await getIconCandidates(inst);
      const w = Math.round((node as any).width || 24);
      const h = Math.round((node as any).height || 24);
      if (candidates.length > 0) {
        const styles: string[] = [];
        applySizing(styles, node, false);
        if (!styles.some(s => s.startsWith('width:') || s.startsWith('flex:'))) styles.push(`width: ${w}px`);
        if (!styles.some(s => s.startsWith('height:'))) styles.push(`height: ${h}px`);
        const fallbackPng = await exportAsBase64Png(node);
        return `${indent}<svg-placeholder data-candidates="${candidates.join('|')}" data-w="${w}" data-h="${h}" data-fallback="${fallbackPng}" style="${styles.join('; ')}"></svg-placeholder>\n`;
      }
      return await renderAsImage(node, indent);
    }
    let inner = '';
    for (const child of inst.children) {
      inner += await nodeToHtml(child, depth + 1);
    }
    const style = buildFrameStyles(inst as any as FrameNode, false);
    if (!inner) return `${indent}<div style="${style}"></div>\n`;
    return `${indent}<div style="${style}">\n${inner}${indent}</div>\n`;
  }

  if (node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') {
    const frame = node as FrameNode;
    const name = frame.name;
    let tag = 'div';

    if (name === 'Body') tag = 'main';
    else if (name === 'Header') tag = 'header';
    else if (name === 'Footer') tag = 'footer';
    else if (name === 'List') tag = 'ul';
    else if (name === 'Row') {
      const parentName = frame.parent && (frame.parent as any).name;
      tag = parentName === 'List' ? 'li' : 'div';
    }
    else if (name.endsWith('Area')) tag = 'section';

    let inner = '';
    for (const child of frame.children) {
      inner += await nodeToHtml(child, depth + 1);
    }

    const style = buildFrameStyles(frame, isRoot);
    const listReset = (tag === 'ul' || tag === 'li') ? '; list-style: none' : '';
    if (!inner) return `${indent}<${tag} style="${style}${listReset}"></${tag}>\n`;
    return `${indent}<${tag} style="${style}${listReset}">\n${inner}${indent}</${tag}>\n`;
  }

  if (isIconNode(node) || hasImageFill(node)) {
    return await renderAsImage(node, indent);
  }

  if (node.type === 'RECTANGLE' || node.type === 'ELLIPSE') {
    const style = buildShapeStyles(node);
    return `${indent}<div style="${style}"></div>\n`;
  }

  return '';
}

function escapeHtmlChars(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Component Template Registry ────────────────────────────────────────────
// 컴포넌트 ID 또는 이름을 HTML 템플릿에 매핑.
// Track 컴포넌트 먼저 추가 → 나중에 ODS 추가해도 자동 통합.
//
// 매칭 우선순위: componentKey > componentId > componentName
// 템플릿 문법:
//   {propName}                        → componentProperties 값으로 치환
//   {children}                        → 자식 노드 HTML로 치환
//   {{component:Name|prop1=val1|...}} → 다른 등록된 컴포넌트 참조 (재귀 해석)
//
// 예시:
//   {
//     componentName: 'ProductCard',
//     source: 'Track-A',
//     template: `<article class="product-card"><img src="{imageUrl}" /><h3>{title}</h3>{{component:Button|label=사기}}</article>`,
//   }

interface ComponentTemplate {
  componentKey?: string;
  componentId?: string;
  componentName?: string;
  source: string;
  template: string;
  variants?: Record<string, string>;
}

// <REGISTRY:BEGIN> — DO NOT EDIT. scripts/build-registry.js가 자동 생성합니다.
// 컴포넌트 추가/수정은 [SpaceAI] 디자인 컴포넌트 md/ 폴더의 MD 파일을 편집하세요.
// Generated at: 2026-06-10T08:18:01.211Z | Total: 1 entries
const COMPONENT_REGISTRY: ComponentTemplate[] = [
  {
    componentId: "75:411",
    componentName: "Top Bar",
    source: "SpaceAI",
    template: `<div style="display:flex;justify-content:space-between;align-items:center;width:100%;height:44px;padding:0 16px;box-sizing:border-box;font-family:'Pretendard','Apple SD Gothic Neo',sans-serif;"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0;"><mask id="mask0_1163_1017" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24"><mask id="mask1_1163_1017" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="3" y="4" width="18" height="16"><path d="M10.1328 4.49834C10.4443 4.18509 10.9509 4.18371 11.2642 4.49526C11.5774 4.80683 11.5788 5.31339 11.2672 5.62666L5.72397 11.2H20.2C20.6418 11.2 21 11.5582 21 12C21 12.4418 20.6418 12.8 20.2 12.8H5.72397L11.2672 18.3733C11.5788 18.6866 11.5774 19.1932 11.2642 19.5047C10.9509 19.8163 10.4443 19.8149 10.1328 19.5017L3.23276 12.5642C2.92725 12.257 2.92249 11.7636 3.21845 11.4506L3.23276 11.4358L10.1328 4.49834Z" fill="black"/></mask><g mask="url(#mask1_1163_1017)"><rect width="24" height="24" fill="#141414"/></g></mask><g mask="url(#mask0_1163_1017)"><rect width="24" height="24" fill="#141414"/></g></svg><span style="font-size:16px;font-weight:500;line-height:20px;letter-spacing:-0.3px;color:#141414;">{titleText}</span><svg-placeholder data-candidates="x" data-w="24" data-h="24" style="width:24px;height:24px;flex-shrink:0;"></svg-placeholder></div>`,
    variants: {
      "Color=White,Type=Home": `<div style="display:flex;justify-content:space-between;align-items:center;width:100%;height:44px;padding:0 16px;box-sizing:border-box;font-family:'Pretendard','Apple SD Gothic Neo',sans-serif;"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0;"><mask id="mask0_1163_1017" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24"><mask id="mask1_1163_1017" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="3" y="4" width="18" height="16"><path d="M10.1328 4.49834C10.4443 4.18509 10.9509 4.18371 11.2642 4.49526C11.5774 4.80683 11.5788 5.31339 11.2672 5.62666L5.72397 11.2H20.2C20.6418 11.2 21 11.5582 21 12C21 12.4418 20.6418 12.8 20.2 12.8H5.72397L11.2672 18.3733C11.5788 18.6866 11.5774 19.1932 11.2642 19.5047C10.9509 19.8163 10.4443 19.8149 10.1328 19.5017L3.23276 12.5642C2.92725 12.257 2.92249 11.7636 3.21845 11.4506L3.23276 11.4358L10.1328 4.49834Z" fill="black"/></mask><g mask="url(#mask1_1163_1017)"><rect width="24" height="24" fill="#141414"/></g></mask><g mask="url(#mask0_1163_1017)"><rect width="24" height="24" fill="white"/></g></svg><div style="display:flex;align-items:center;gap:0;"><div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;width:40px;height:44px;"><svg-placeholder data-candidates="cube|cube_badge_sparkle" data-w="20" data-h="20" style="width:20px;height:20px;filter:brightness(0) invert(1);"></svg-placeholder><span style="font-size:12px;font-weight:500;line-height:16px;letter-spacing:-0.3px;color:#8C8C8C;">뷰 변경</span></div><div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;width:40px;height:44px;"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0;"><mask id="mask0_1163_1078" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="3" y="3" width="18" height="18"><path d="M3.99995 13.2C4.44178 13.2 4.79995 13.5582 4.79995 14V19.2H9.99995C10.4418 19.2 10.8 19.5582 10.8 20C10.8 20.4418 10.4418 20.8 9.99995 20.8H3.99995C3.55812 20.8 3.19995 20.4418 3.19995 20V14C3.19995 13.5582 3.55812 13.2 3.99995 13.2Z" fill="black"/><path d="M20 3.2C20.4418 3.2 20.8 3.55817 20.8 4V10C20.8 10.4418 20.4418 10.8 20 10.8C19.5581 10.8 19.2 10.4418 19.2 10V4.8H14C13.5581 4.8 13.2 4.44182 13.2 4C13.2 3.55817 13.5581 3.2 14 3.2H20Z" fill="black"/></mask><g mask="url(#mask0_1163_1078)"><rect width="24" height="24" fill="white"/></g></svg><span style="font-size:12px;font-weight:500;line-height:16px;letter-spacing:-0.3px;color:#8C8C8C;">캡처</span></div><div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;width:40px;height:44px;"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0;"><g clip-path="url(#clip0_1163_1093)"><mask id="mask0_1163_1093" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="2" y="2" width="20" height="20"><path d="M7.99995 14.7C8.49701 14.7 8.89995 15.1029 8.89995 15.6C8.89995 16.0971 8.49701 16.5 7.99995 16.5C7.50289 16.5 7.09995 16.0971 7.09995 15.6C7.09995 15.1029 7.50289 14.7 7.99995 14.7Z" fill="black"/><path d="M16.25 14.8C16.6918 14.8 17.05 15.1582 17.05 15.6C17.05 16.0418 16.6918 16.4 16.25 16.4H11.35C10.9081 16.4 10.55 16.0418 10.55 15.6C10.55 15.1582 10.9081 14.8 11.35 14.8H16.25Z" fill="black"/><path d="M7.99995 11.1C8.49701 11.1 8.89995 11.5029 8.89995 12C8.89995 12.4971 8.49701 12.9 7.99995 12.9C7.50289 12.9 7.09995 12.4971 7.09995 12C7.09995 11.5029 7.50289 11.1 7.99995 11.1Z" fill="black"/><path d="M16.25 11.2C16.6918 11.2 17.05 11.5582 17.05 12C17.05 12.4418 16.6918 12.8 16.25 12.8H11.35C10.9081 12.8 10.55 12.4418 10.55 12C10.55 11.5582 10.9081 11.2 11.35 11.2H16.25Z" fill="black"/><path d="M7.99995 7.5C8.49701 7.5 8.89995 7.90294 8.89995 8.4C8.89995 8.89705 8.49701 9.3 7.99995 9.3C7.50289 9.3 7.09995 8.89705 7.09995 8.4C7.09995 7.90294 7.50289 7.5 7.99995 7.5Z" fill="black"/><path d="M16.25 7.6C16.6918 7.6 17.05 7.95817 17.05 8.4C17.05 8.84182 16.6918 9.2 16.25 9.2H11.35C10.9081 9.2 10.55 8.84183 10.55 8.4C10.55 7.95817 10.9081 7.6 11.35 7.6H16.25Z" fill="black"/><path fill-rule="evenodd" clip-rule="evenodd" d="M16.125 2.95C17.645 2.95 18.9248 3.29694 19.8139 4.18603C20.703 5.07513 21.05 6.35487 21.05 7.875V16.125C21.05 17.6451 20.703 18.9249 19.8139 19.814C18.9248 20.7031 17.645 21.05 16.125 21.05H7.87495C6.35489 21.05 5.07515 20.7031 4.18604 19.814C3.29692 18.9249 2.94995 17.6451 2.94995 16.125V7.875C2.94995 6.35487 3.29692 5.07513 4.18604 4.18603C5.07515 3.29694 6.35489 2.95 7.87495 2.95H16.125ZM7.87495 4.55C6.56645 4.55 5.78368 4.8512 5.31743 5.31743C4.85119 5.78366 4.54995 6.56644 4.54995 7.875V16.125C4.54995 17.4336 4.85119 18.2163 5.31743 18.6826C5.78368 19.1488 6.56645 19.45 7.87495 19.45H16.125C17.4334 19.45 18.2162 19.1488 18.6825 18.6826C19.1487 18.2163 19.45 17.4336 19.45 16.125V7.875C19.45 6.56644 19.1487 5.78366 18.6825 5.31743C18.2162 4.8512 17.4334 4.55 16.125 4.55H7.87495Z" fill="black"/></mask><g mask="url(#mask0_1163_1093)"><rect width="24" height="24" fill="white"/></g></g><defs><clipPath id="clip0_1163_1093"><rect width="24" height="24" fill="white"/></clipPath></defs></svg><span style="font-size:12px;font-weight:500;line-height:16px;letter-spacing:-0.3px;color:#8C8C8C;">방 목록</span></div><div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;width:40px;height:44px;"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0;"><mask id="mask0_1163_1110" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="3" y="4" width="18" height="16"><path d="M19.55 17.65C19.9918 17.65 20.35 18.0082 20.35 18.45C20.35 18.8918 19.9918 19.25 19.55 19.25H4.39998C3.95815 19.25 3.59998 18.8918 3.59998 18.45C3.59998 18.0082 3.95815 17.65 4.39998 17.65H19.55Z" fill="black"/><path d="M19.55 11.2C19.9918 11.2 20.35 11.5582 20.35 12C20.35 12.4418 19.9918 12.8 19.55 12.8H4.39998C3.95815 12.8 3.59998 12.4418 3.59998 12C3.59998 11.5582 3.95815 11.2 4.39998 11.2H19.55Z" fill="black"/><path d="M19.55 4.75C19.9918 4.75 20.35 5.10817 20.35 5.55C20.35 5.99183 19.9918 6.35 19.55 6.35H4.39998C3.95815 6.35 3.59998 5.99183 3.59998 5.55C3.59998 5.10817 3.95815 4.75 4.39998 4.75H19.55Z" fill="black"/></mask><g mask="url(#mask0_1163_1110)"><rect width="24" height="24" fill="white"/></g></svg><span style="font-size:12px;font-weight:500;line-height:16px;letter-spacing:-0.3px;color:#8C8C8C;">메뉴</span></div></div></div>`,
      "Color=White,Type=General": `<div style="display:flex;justify-content:space-between;align-items:center;width:100%;height:44px;padding:0 16px;box-sizing:border-box;font-family:'Pretendard','Apple SD Gothic Neo',sans-serif;"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0;"><mask id="mask0_1163_1017" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24"><mask id="mask1_1163_1017" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="3" y="4" width="18" height="16"><path d="M10.1328 4.49834C10.4443 4.18509 10.9509 4.18371 11.2642 4.49526C11.5774 4.80683 11.5788 5.31339 11.2672 5.62666L5.72397 11.2H20.2C20.6418 11.2 21 11.5582 21 12C21 12.4418 20.6418 12.8 20.2 12.8H5.72397L11.2672 18.3733C11.5788 18.6866 11.5774 19.1932 11.2642 19.5047C10.9509 19.8163 10.4443 19.8149 10.1328 19.5017L3.23276 12.5642C2.92725 12.257 2.92249 11.7636 3.21845 11.4506L3.23276 11.4358L10.1328 4.49834Z" fill="black"/></mask><g mask="url(#mask1_1163_1017)"><rect width="24" height="24" fill="#141414"/></g></mask><g mask="url(#mask0_1163_1017)"><rect width="24" height="24" fill="white"/></g></svg><span style="font-size:16px;font-weight:500;line-height:20px;letter-spacing:-0.3px;color:#FFFFFF;">{titleText}</span><svg-placeholder data-candidates="x" data-w="24" data-h="24" style="width:24px;height:24px;flex-shrink:0;filter:brightness(0) invert(1);"></svg-placeholder></div>`,
      "Color=Black,Type=General": `<div style="display:flex;justify-content:space-between;align-items:center;width:100%;height:44px;padding:0 16px;box-sizing:border-box;font-family:'Pretendard','Apple SD Gothic Neo',sans-serif;"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0;"><mask id="mask0_1163_1017" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24"><mask id="mask1_1163_1017" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="3" y="4" width="18" height="16"><path d="M10.1328 4.49834C10.4443 4.18509 10.9509 4.18371 11.2642 4.49526C11.5774 4.80683 11.5788 5.31339 11.2672 5.62666L5.72397 11.2H20.2C20.6418 11.2 21 11.5582 21 12C21 12.4418 20.6418 12.8 20.2 12.8H5.72397L11.2672 18.3733C11.5788 18.6866 11.5774 19.1932 11.2642 19.5047C10.9509 19.8163 10.4443 19.8149 10.1328 19.5017L3.23276 12.5642C2.92725 12.257 2.92249 11.7636 3.21845 11.4506L3.23276 11.4358L10.1328 4.49834Z" fill="black"/></mask><g mask="url(#mask1_1163_1017)"><rect width="24" height="24" fill="#141414"/></g></mask><g mask="url(#mask0_1163_1017)"><rect width="24" height="24" fill="#141414"/></g></svg><span style="font-size:16px;font-weight:500;line-height:20px;letter-spacing:-0.3px;color:#141414;">{titleText}</span><svg-placeholder data-candidates="x" data-w="24" data-h="24" style="width:24px;height:24px;flex-shrink:0;"></svg-placeholder></div>`,
    },
  },
];
// <REGISTRY:END>

// ── Runtime Registry Fetch (GitHub) ────────────────────────────────────────
// GitHub GinaBaek/oslice (개인 public repo) 에서 MD 파일을 fetch해서
// COMPONENT_REGISTRY를 동적으로 갱신/추가합니다.
// (Ohouse-product-design organization은 외부 anonymous 차단되어 fetch 불가)
// 빌드 타임 주입은 오프라인 fallback으로 유지됩니다.
const REGISTRY_GITHUB_API = 'https://api.github.com/repos/GinaBaek/oslice/contents';
const REGISTRY_MD_PATHS = [
  '과업/O!Slice/[SpaceAI] 디자인 컴포넌트 md',
  // 향후 추가: '과업/O!Slice/[ODS] 디자인 컴포넌트 md',
];

let registryFetchPromise: Promise<void> | null = null;

function encodePath(p: string): string {
  return p.split('/').map(encodeURIComponent).join('/');
}

function parseMdContent(md: string): ComponentTemplate | null {
  const titleMatch = md.match(/^#\s+\[([^\]]+)\]\s+(.+?)\s*$/m);
  if (!titleMatch) return null;
  const source = titleMatch[1].trim();
  const componentName = titleMatch[2].trim();

  const nodeIdMatch = md.match(/\*\*Node ID\*\*\s*:\s*`([^`]+)`/);
  const componentId = nodeIdMatch ? nodeIdMatch[1].trim() : undefined;

  const keyMatch = md.match(/\*\*Component Key\*\*\s*:\s*`([^`]+)`/);
  const componentKey = keyMatch ? keyMatch[1].trim() : undefined;

  const htmlSectionMatch = md.match(/##\s+(?:\d+\.\s+)?HTML Template[\s\S]*?(?=\n##\s|\n#\s|$)/);
  if (!htmlSectionMatch) return null;

  let template = '';
  const variants: Record<string, string> = {};

  const subsections = htmlSectionMatch[0].split(/\n###\s+/).slice(1);
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
        const parts = variantMatch[1].split(',').map(s => s.trim()).filter(Boolean).sort();
        variants[parts.join(',')] = html;
      }
    }
  }

  if (!template && Object.keys(variants).length === 0) return null;
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

function mergeIntoRegistry(parsed: ComponentTemplate): 'added' | 'replaced' {
  const idx = COMPONENT_REGISTRY.findIndex(t =>
    (parsed.componentId && t.componentId === parsed.componentId) ||
    (parsed.componentName && t.componentName === parsed.componentName)
  );
  if (idx >= 0) {
    COMPONENT_REGISTRY[idx] = parsed;
    return 'replaced';
  }
  COMPONENT_REGISTRY.push(parsed);
  return 'added';
}

async function fetchRegistryFromGitHubOnce(): Promise<void> {
  if (registryFetchPromise) return registryFetchPromise;
  registryFetchPromise = (async () => {
    console.log('[O!Slice] Fetching registry from GitHub…');
    let totalFetched = 0;
    for (const mdDir of REGISTRY_MD_PATHS) {
      try {
        const listUrl = `${REGISTRY_GITHUB_API}/${encodePath(mdDir)}`;
        const listResp = await fetch(listUrl);
        if (!listResp.ok) {
          console.warn('[O!Slice] MD listing failed:', mdDir, listResp.status);
          continue;
        }
        const files = await listResp.json();
        if (!Array.isArray(files)) continue;

        for (const f of files) {
          if (!f.name || !f.name.endsWith('.md') || !f.download_url) continue;
          try {
            const mdResp = await fetch(f.download_url);
            if (!mdResp.ok) continue;
            const md = await mdResp.text();
            const parsed = parseMdContent(md);
            if (parsed) {
              const action = mergeIntoRegistry(parsed);
              console.log(`[O!Slice] ${action}: ${parsed.componentName} (id=${parsed.componentId || '-'}) from ${f.name}`);
              totalFetched++;
            }
          } catch (e: any) {
            console.warn('[O!Slice] MD fetch failed:', f.name, e && e.message);
          }
        }
      } catch (e: any) {
        console.warn('[O!Slice] Registry fetch error:', mdDir, e && e.message);
      }
    }
    console.log(`[O!Slice] Registry fetch done. Fetched ${totalFetched} entries. Total registry size: ${COMPONENT_REGISTRY.length}`);
  })();
  return registryFetchPromise;
}

type ComponentProps = Record<string, string>;

async function findTemplate(inst: InstanceNode): Promise<ComponentTemplate | null> {
  await fetchRegistryFromGitHubOnce();
  if (COMPONENT_REGISTRY.length === 0) return null;
  let mainComp: ComponentNode | null = null;
  try {
    mainComp = await inst.getMainComponentAsync();
  } catch (_) {}

  const candidates: { type: string; value: string }[] = [];

  if (mainComp) {
    const key = (mainComp as any).key;
    if (key) candidates.push({ type: 'key', value: key });
    candidates.push({ type: 'id', value: mainComp.id });
    if (mainComp.parent && mainComp.parent.type === 'COMPONENT_SET') {
      const set = mainComp.parent as ComponentSetNode;
      const setKey = (set as any).key;
      if (setKey) candidates.push({ type: 'key', value: setKey });
      candidates.push({ type: 'id', value: set.id });
      candidates.push({ type: 'name', value: stripBracketTags(stripEmoji(set.name)) });
      candidates.push({ type: 'name-raw', value: set.name });
    } else {
      candidates.push({ type: 'name', value: stripBracketTags(stripEmoji(mainComp.name)) });
      candidates.push({ type: 'name-raw', value: mainComp.name });
    }
  }
  candidates.push({ type: 'name', value: stripBracketTags(stripEmoji(inst.name)) });
  candidates.push({ type: 'name-raw', value: inst.name });

  console.log('[O!Slice v2-' + Date.now() + '] Registry size:', COMPONENT_REGISTRY.length, 'entries');
  console.log('[O!Slice] Registry entries:', COMPONENT_REGISTRY.map(t => ({
    id: t.componentId, name: t.componentName, key: t.componentKey
  })));
  console.log('[O!Slice] Template lookup candidates:', candidates);

  for (const c of candidates) {
    let found: ComponentTemplate | undefined;
    if (c.type === 'key') found = COMPONENT_REGISTRY.find(t => t.componentKey === c.value);
    else if (c.type === 'id') found = COMPONENT_REGISTRY.find(t => t.componentId === c.value);
    else found = COMPONENT_REGISTRY.find(t => t.componentName === c.value);
    console.log('[O!Slice] Trying:', c.type, '=', JSON.stringify(c.value), '→', found ? 'MATCH' : 'no match');
    if (found) {
      console.log('[O!Slice] Matched template:', found.componentName, 'via', c.type, '=', c.value);
      return found;
    }
  }
  console.log('[O!Slice] No template matched.');
  return null;
}

function getInstancePropsSync(inst: InstanceNode): ComponentProps {
  const props: ComponentProps = {};
  const compProps = (inst as any).componentProperties;
  if (compProps) {
    for (const key of Object.keys(compProps)) {
      const p = compProps[key];
      if (p && p.value !== undefined) {
        const cleanKey = key.split('#')[0];
        props[cleanKey] = String(p.value);
      }
    }
  }
  return props;
}

function pickTemplateBody(tpl: ComponentTemplate, props: ComponentProps): string {
  if (tpl.variants) {
    // variant key 형식: "Color=Default,Type=Home" — 명시된 모든 prop이 일치하면 매칭
    for (const k of Object.keys(tpl.variants)) {
      const required = k.split(',').map(p => {
        const eq = p.indexOf('=');
        return { key: p.slice(0, eq).trim(), value: p.slice(eq + 1).trim() };
      });
      const allMatch = required.every(r => props[r.key] === r.value);
      if (allMatch) {
        console.log('[O!Slice] Variant matched:', k);
        return tpl.variants[k];
      }
    }
    console.log('[O!Slice] No variant matched, using default. props=', JSON.stringify(props), 'available variants=', Object.keys(tpl.variants));
  }
  return tpl.template;
}

// 사람이 쓰기 편하게 props key를 다양한 표기로 lookup 가능하게 함.
// 예: {titleText} 또는 {Title Text} 둘 다 "Title Text" prop을 찾음.
function lookupProp(props: ComponentProps, name: string): string | undefined {
  if (props[name] !== undefined) return props[name];
  // camelCase → "Title Text" (capitalized words with spaces)
  const spaced = name.replace(/([A-Z])/g, ' $1').trim().replace(/^./, c => c.toUpperCase());
  if (props[spaced] !== undefined) return props[spaced];
  // 대소문자/공백 무시 fallback
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');
  const target = norm(name);
  for (const k of Object.keys(props)) {
    if (norm(k) === target) return props[k];
  }
  return undefined;
}

function resolveTemplate(template: string, props: ComponentProps, children: string): string {
  // {Name} 또는 {name} 또는 {Title Text} 모두 허용
  let result = template.replace(/\{([a-zA-Z_][a-zA-Z0-9_ ]*)\}/g, (m, name) => {
    if (name === 'children') return children;
    const v = lookupProp(props, name);
    return v !== undefined ? escapeHtmlChars(v) : '';
  });

  result = result.replace(/\{\{component:([^|}]+)((?:\|[^=|}]+=[^|}]+)*)\}\}/g, (m, compRef, propsStr) => {
    const ref = COMPONENT_REGISTRY.find(t => t.componentName === compRef || t.componentId === compRef);
    if (!ref) return '';
    const refProps: ComponentProps = {};
    if (propsStr) {
      propsStr.split('|').filter(Boolean).forEach((p: string) => {
        const eq = p.indexOf('=');
        if (eq > 0) refProps[p.slice(0, eq)] = p.slice(eq + 1);
      });
    }
    const body = pickTemplateBody(ref, refProps);
    return resolveTemplate(body, refProps, '');
  });

  return result;
}

