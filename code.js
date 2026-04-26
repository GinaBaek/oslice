"use strict";
figma.showUI(__html__, { width: 400, height: 600 });
(async () => {
    const saved = await figma.clientStorage.getAsync('knownIssues');
    const knownIds = Array.isArray(saved) ? saved : [];
    figma.ui.postMessage({ type: 'init-known', knownIds });
})();
let lastValidatedId = null;
let pluginSelecting = false;
function getTopLevelFrame(node) {
    let current = node;
    while (current.parent && current.parent.type !== 'PAGE') {
        current = current.parent;
    }
    return current.type === 'FRAME' ? current : null;
}
function isScreen(frame) {
    if (!frame.parent || frame.parent.type !== 'PAGE')
        return false;
    return [...frame.children].some(c => {
        const n = c.name.toLowerCase();
        return n.includes('status bar') || n.includes('statusbar') || n === 'header' || n === 'body';
    });
}
figma.on('selectionchange', () => {
    if (pluginSelecting)
        return;
    const sel = figma.currentPage.selection;
    if (sel.length === 0)
        return;
    const node = sel[0];
    // 선택한 노드 자체가 PAGE의 직접 자식 FRAME일 때만 지면 전환으로 판단
    if (node.type !== 'FRAME' || !isScreen(node))
        return;
    const screenId = node.id;
    if (screenId !== lastValidatedId) {
        figma.ui.postMessage({ type: 'selection-changed' });
    }
});
const ANTHROPIC_API_KEY = 'YOUR_API_KEY_HERE';
function isSnakeCase(name) {
    return /^[a-z][a-z0-9_]*$/.test(name);
}
// ── Helpers ────────────────────────────────────────────────────────────────
function stripEmoji(str) {
    return str.replace(/[\u{1F000}-\u{1FFFF}]|[\u{2600}-\u{27BF}]|[\u{2300}-\u{23FF}]|[\uD800-\uDBFF][\uDC00-\uDFFF]|\p{Emoji_Presentation}/gu, '').replace(/\s+/g, ' ').trim();
}
function stripBracketTags(str) {
    if (/\[Icon\]/i.test(str))
        return 'Icon';
    if (/\[Asset\]/i.test(str))
        return 'Asset';
    return str
        .replace(/\[[^\]]+\]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}
async function getCompName(instance) {
    const comp = await instance.getMainComponentAsync();
    if (!comp)
        return 'Component';
    const raw = comp.parent && comp.parent.type === 'COMPONENT_SET' ? comp.parent.name : comp.name;
    const cleaned = stripBracketTags(stripEmoji(raw));
    if (!cleaned)
        return 'Component';
    if (/img$/i.test(cleaned))
        return 'Img';
    return cleaned;
}
async function isHeadingText(textNode) {
    const boundVars = textNode.boundVariables;
    if (!boundVars)
        return false;
    const vars = figma.variables;
    if (!vars || !vars.getVariableByIdAsync)
        return false;
    for (const key of Object.keys(boundVars)) {
        const binding = boundVars[key];
        const bindings = Array.isArray(binding) ? binding : [binding];
        for (const b of bindings) {
            if (b && b.id) {
                try {
                    const variable = await vars.getVariableByIdAsync(b.id);
                    if (variable && typeof variable.name === 'string' && variable.name.toLowerCase().includes('heading'))
                        return true;
                }
                catch (_) { }
            }
        }
    }
    return false;
}
async function isHeadingInstance(inst) {
    const kids = [...inst.children];
    if (kids.length === 0 || !kids.every(c => c.type === 'TEXT'))
        return false;
    for (const kid of kids) {
        if (await isHeadingText(kid))
            return true;
    }
    return false;
}
function isTextInstance(inst) {
    const kids = [...inst.children];
    return kids.length > 0 && kids.every(c => c.type === 'TEXT') && inst.name.toLowerCase().includes('text');
}
function findFirstInstance(frame) {
    for (const child of frame.children) {
        if (child.type === 'INSTANCE')
            return child;
        if (child.type === 'FRAME') {
            const found = findFirstInstance(child);
            if (found)
                return found;
        }
    }
    return null;
}
function getShapeLabel(node) {
    const n = node.name.toLowerCase();
    // GIF은 Figma에 별도 속성이 없어 이름 기반으로 유지
    if (n.includes('gif'))
        return 'GIF';
    const fills = node.fills;
    if (fills && fills.some((f) => f.type === 'IMAGE'))
        return 'Img';
    const strokes = node.strokes;
    const hasVisibleFill = fills && fills.some((f) => f.visible !== false);
    if (strokes && strokes.length > 0 && !hasVisibleFill)
        return 'Stroke';
    return 'Shape';
}
async function isSameComponent(instances) {
    if (instances.length <= 1)
        return true;
    const first = await getCompName(instances[0]);
    for (let i = 1; i < instances.length; i++) {
        if (await getCompName(instances[i]) !== first)
            return false;
    }
    return true;
}
function isStructuralName(name) {
    return name === 'Body' || name === 'List' || name === 'Row' ||
        name === 'Header' || name === 'Footer' ||
        name === 'Status Bar' || name === 'Top Bar' || name === 'CTA Bar' ||
        name.endsWith('Area');
}
// ── Naming Logic ───────────────────────────────────────────────────────────
function isListLikeFrame(cf) {
    const cfChildren = [...cf.children];
    const allInst = cfChildren.length >= 2 && cfChildren.every(gc => gc.type === 'INSTANCE');
    const allRows = cfChildren.length >= 1 && cfChildren.every(gc => gc.type === 'FRAME' && [...gc.children].every(ggc => ggc.type === 'INSTANCE'));
    return cf.name === 'List' || allInst || allRows;
}
async function computeAreaName(frame) {
    const children = [...frame.children];
    const parts = [];
    for (const child of children) {
        if (child.type === 'TEXT') {
            const heading = await isHeadingText(child);
            const label = heading ? 'Title' : 'Text';
            if (!parts.includes(label))
                parts.push(label);
        }
        else if (child.type === 'INSTANCE') {
            const inst = child;
            if (isTextInstance(inst)) {
                const heading = await isHeadingInstance(inst);
                const label = heading ? 'Title' : 'Text';
                if (!parts.includes(label))
                    parts.push(label);
                continue;
            }
            const name = await getCompName(inst);
            if (!parts.includes(name))
                parts.push(name);
        }
        else if (child.type === 'FRAME') {
            // List / Row 구조 → 내부 모듈 이름으로 표현 (naming.md: Module Name Area 패턴)
            const cf = child;
            if (isListLikeFrame(cf)) {
                const moduleInst = findFirstInstance(cf);
                if (moduleInst) {
                    const name = await getCompName(moduleInst);
                    if (!parts.includes(name))
                        parts.push(name);
                }
            }
        }
        else if (child.type === 'RECTANGLE' || child.type === 'ELLIPSE' || child.type === 'VECTOR') {
            const label = getShapeLabel(child);
            if (!parts.includes(label))
                parts.push(label);
        }
    }
    if (parts.length === 0)
        return frame.name;
    return parts.join(' + ') + ' Area';
}
async function computeFrameName(frame) {
    if (!frame.parent || frame.parent.type === 'PAGE')
        return null;
    if (['Body', 'Status Bar', 'Top Bar', 'CTA Bar', 'List', 'Row'].includes(frame.name))
        return null;
    const children = [...frame.children];
    if (children.length === 0)
        return null;
    const allInstances = children.every(c => c.type === 'INSTANCE');
    if (allInstances) {
        if (children.length === 1) {
            const inst = children[0];
            if (isTextInstance(inst)) {
                const heading = await isHeadingInstance(inst);
                return heading ? 'Title Area' : 'Text Area';
            }
            return (await getCompName(inst)) + ' Area';
        }
        if (frame.parent.type === 'FRAME' && frame.parent.name === 'List')
            return 'Row';
        if (await isSameComponent(children))
            return 'List';
        // 컴포넌트가 혼합된 경우 Area로 네이밍
        if (frame.name.endsWith('Area'))
            return null;
        return await computeAreaName(frame);
    }
    const allFrames = children.every(c => c.type === 'FRAME');
    if (allFrames && children.length >= 2) {
        const allRowsOfInstances = children.every(c => {
            const cf = c;
            return cf.children.length > 0 && [...cf.children].every(gc => gc.type === 'INSTANCE');
        });
        if (allRowsOfInstances) {
            let allRowsUniform = true;
            for (const child of children) {
                if (!await isSameComponent([...child.children])) {
                    allRowsUniform = false;
                    break;
                }
            }
            if (allRowsUniform) {
                if (frame.name.endsWith('Area'))
                    return null;
                return 'List';
            }
        }
    }
    return await computeAreaName(frame);
}
function snapshotFrame(frame) {
    return {
        name: frame.name,
        layoutMode: frame.layoutMode,
        primaryAxisAlignItems: frame.primaryAxisAlignItems,
        counterAxisAlignItems: frame.counterAxisAlignItems,
        primaryAxisSizingMode: frame.primaryAxisSizingMode,
        counterAxisSizingMode: frame.counterAxisSizingMode,
        itemSpacing: frame.itemSpacing,
        paddingTop: frame.paddingTop, paddingBottom: frame.paddingBottom,
        paddingLeft: frame.paddingLeft, paddingRight: frame.paddingRight,
        width: frame.width, height: frame.height,
        fills: (Array.isArray(frame.fills) ? frame.fills : []),
        clipsContent: frame.clipsContent,
        childIds: [...frame.children].map(c => c.id),
    };
}
async function restoreFrame(frame, snap) {
    frame.name = snap.name;
    frame.fills = snap.fills;
    frame.clipsContent = snap.clipsContent;
    frame.paddingTop = snap.paddingTop;
    frame.paddingBottom = snap.paddingBottom;
    frame.paddingLeft = snap.paddingLeft;
    frame.paddingRight = snap.paddingRight;
    frame.itemSpacing = snap.itemSpacing;
    if (snap.layoutMode === 'NONE') {
        frame.layoutMode = 'NONE';
        frame.resize(snap.width, snap.height);
    }
    else {
        frame.layoutMode = snap.layoutMode;
        frame.primaryAxisAlignItems = snap.primaryAxisAlignItems;
        frame.counterAxisAlignItems = snap.counterAxisAlignItems;
        frame.primaryAxisSizingMode = snap.primaryAxisSizingMode;
        frame.counterAxisSizingMode = snap.counterAxisSizingMode;
        if (snap.primaryAxisSizingMode === 'FIXED')
            frame.resize(snap.width, frame.height);
        if (snap.counterAxisSizingMode === 'FIXED')
            frame.resize(frame.width, snap.height);
    }
}
async function applyRevert(ops) {
    for (const op of [...ops].reverse()) {
        if (op.op === 'rename') {
            const node = await figma.getNodeByIdAsync(op.nodeId);
            if (node)
                node.name = op.name;
        }
        if (op.op === 'remove-layout') {
            const node = await figma.getNodeByIdAsync(op.nodeId);
            if (node && node.type === 'FRAME')
                await restoreFrame(node, op.snap);
        }
        if (op.op === 'unwrap-list') {
            const parent = await figma.getNodeByIdAsync(op.parentId);
            const list = await figma.getNodeByIdAsync(op.listId);
            if (parent && parent.type === 'FRAME' && list && list.type === 'FRAME') {
                const pf = parent;
                const lf = list;
                const idx = [...pf.children].indexOf(lf);
                const kids = [...lf.children];
                for (let i = kids.length - 1; i >= 0; i--)
                    pf.insertChild(idx, kids[i]);
                lf.remove();
                if (op.childPositions) {
                    for (const pos of op.childPositions) {
                        const child = await figma.getNodeByIdAsync(pos.id);
                        if (child && child.x !== undefined) {
                            child.x = pos.x;
                            child.y = pos.y;
                        }
                    }
                }
            }
        }
        if (op.op === 'show-node') {
            const node = await figma.getNodeByIdAsync(op.nodeId);
            if (node)
                node.visible = true;
        }
        if (op.op === 'restore-scroll') {
            const node = await figma.getNodeByIdAsync(op.nodeId);
            if (node && node.type === 'FRAME') {
                const frame = node;
                frame.overflowDirection = op.overflowDirection;
                frame.numberOfFixedChildren = op.numberOfFixedChildren;
            }
        }
        if (op.op === 'rewrap-area') {
            const parent = await figma.getNodeByIdAsync(op.parentId);
            if (!parent || parent.type !== 'FRAME')
                continue;
            const pf = parent;
            pf.paddingTop = op.parentPaddingSnap.pt;
            pf.paddingBottom = op.parentPaddingSnap.pb;
            pf.paddingLeft = op.parentPaddingSnap.pl;
            pf.paddingRight = op.parentPaddingSnap.pr;
            const inner = figma.createFrame();
            pf.insertChild(op.insertIndex, inner);
            await restoreFrame(inner, op.snap);
            for (const childId of op.snap.childIds) {
                const child = await figma.getNodeByIdAsync(childId);
                if (child)
                    inner.appendChild(child);
            }
        }
    }
}
function makeAreaFrame(name, paddingTop = 0) {
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
function makeListFrame(direction) {
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
async function applyAreaGrouping(frame) {
    const ops = [];
    const instances = [...frame.children].filter(c => c.type === 'INSTANCE');
    if (instances.length === 0)
        return ops;
    const bodySnap = snapshotFrame(frame);
    const bodyPaddingTop = frame.paddingTop;
    if (frame.layoutMode === 'NONE')
        applyAutoLayout(frame);
    // 모든 인스턴스의 컴포넌트 이름 미리 계산
    const compNameMap = new Map();
    for (const inst of instances) {
        compNameMap.set(inst.id, await getCompName(inst));
    }
    const slices = groupByHorizontalSlice(instances);
    // 슬라이스의 컴포넌트 조합 시그니처 (정렬된 고유 이름)
    function sliceSig(slice) {
        const names = slice.map(n => compNameMap.get(n.id) || 'Component');
        return [...new Set(names)].sort().join('+');
    }
    // 슬라이스 내 모든 인스턴스가 동일 컴포넌트인지 확인
    function isUniformSlice(slice) {
        if (slice.length === 0)
            return false;
        const first = compNameMap.get(slice[0].id) || 'Component';
        return slice.every(n => (compNameMap.get(n.id) || 'Component') === first);
    }
    const groups = [];
    let i = 0;
    while (i < slices.length) {
        const sig = sliceSig(slices[i]);
        const uniform = isUniformSlice(slices[i]);
        if (uniform) {
            let j = i + 1;
            while (j < slices.length && isUniformSlice(slices[j]) && sliceSig(slices[j]) === sig)
                j++;
            if (j - i >= 2) {
                groups.push({ kind: 'rows', slices: slices.slice(i, j) });
                i = j;
                continue;
            }
        }
        groups.push({ kind: 'single', slice: slices[i] });
        i++;
    }
    const createdAreas = [];
    for (const group of groups) {
        if (group.kind === 'rows') {
            // 반복 Row 구조: Area > List > [Row, Row, ...]
            const firstSlice = group.slices[0];
            const compNames = [];
            for (const n of firstSlice) {
                const name = compNameMap.get(n.id) || 'Component';
                if (!compNames.includes(name))
                    compNames.push(name);
            }
            const areaName = compNames.join(' + ') + ' Area';
            const firstIndex = [...frame.children].indexOf(firstSlice[0]);
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
                for (const inst of slice)
                    row.appendChild(inst);
            }
            ops.push({ op: 'unwrap-list', parentId: frame.id, listId: area.id });
        }
        else {
            // 단일 슬라이스
            const { slice } = group;
            const compNames = [];
            for (const n of slice) {
                const name = compNameMap.get(n.id) || 'Component';
                if (!compNames.includes(name))
                    compNames.push(name);
            }
            const areaName = compNames.join(' + ') + ' Area';
            const firstIndex = [...frame.children].indexOf(slice[0]);
            const area = makeAreaFrame(areaName, bodyPaddingTop);
            frame.insertChild(firstIndex, area);
            createdAreas.push(area);
            if (slice.length >= 2 && compNames.length === 1) {
                // 같은 컴포넌트 여러 개 → List로 감싸기
                const list = makeListFrame(inferDirection(slice));
                area.appendChild(list);
                for (const inst of slice)
                    list.appendChild(inst);
                ops.push({ op: 'unwrap-list', parentId: area.id, listId: list.id });
            }
            else {
                for (const inst of slice)
                    area.appendChild(inst);
            }
            ops.push({ op: 'unwrap-list', parentId: frame.id, listId: area.id });
        }
    }
    if (createdAreas.length > 0) {
        createdAreas[0].paddingTop = bodyPaddingTop;
        for (let i = 1; i < createdAreas.length; i++)
            createdAreas[i].paddingTop = 0;
        createdAreas[createdAreas.length - 1].paddingBottom = 64;
        for (let i = 0; i < createdAreas.length - 1; i++)
            createdAreas[i].paddingBottom = 0;
        frame.paddingTop = 0;
        frame.paddingBottom = 0;
    }
    ops.unshift({ op: 'remove-layout', nodeId: frame.id, snap: bodySnap });
    return ops;
}
async function applyAreaGroupingById(nodeId) {
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node || node.type !== 'FRAME')
        throw new Error('노드를 찾을 수 없어요.');
    return applyAreaGrouping(node);
}
// ── Structure Logic ────────────────────────────────────────────────────────
function inferDirection(nodes) {
    if (nodes.length < 2)
        return 'VERTICAL';
    const a = nodes[0];
    const b = nodes[1];
    return Math.abs(b.x - a.x) > Math.abs(b.y - a.y) ? 'HORIZONTAL' : 'VERTICAL';
}
function groupByHorizontalSlice(nodes) {
    if (nodes.length === 0)
        return [];
    const sorted = [...nodes].sort((a, b) => a.y - b.y);
    const slices = [];
    let current = [sorted[0]];
    let maxY = sorted[0].y + sorted[0].height;
    for (let i = 1; i < sorted.length; i++) {
        const node = sorted[i];
        const nodeY = node.y;
        if (nodeY < maxY) {
            current.push(node);
            maxY = Math.max(maxY, nodeY + node.height);
        }
        else {
            slices.push(current);
            current = [node];
            maxY = nodeY + node.height;
        }
    }
    slices.push(current);
    return slices;
}
function applyAutoLayout(frame) {
    const children = [...frame.children];
    const direction = inferDirection(frame.children);
    // 레이아웃 적용 전 자식 위치 기록
    const withPos = children.map(c => ({
        node: c,
        x: c.x,
        y: c.y,
        w: c.width,
        h: c.height,
    }));
    // children 배열을 시각적 순서(Y 또는 X)로 재정렬
    const sorted = direction === 'VERTICAL'
        ? [...withPos].sort((a, b) => a.y - b.y)
        : [...withPos].sort((a, b) => a.x - b.x);
    sorted.forEach((item, index) => frame.insertChild(index, item.node));
    frame.layoutMode = direction;
    frame.primaryAxisAlignItems = 'MIN';
    frame.counterAxisAlignItems = 'MIN';
    if (sorted.length === 0)
        return;
    if (direction === 'VERTICAL') {
        frame.paddingTop = Math.max(0, Math.round(sorted[0].y));
        if (sorted.length > 1) {
            const gaps = sorted.slice(1).map((p, i) => Math.max(0, Math.round(p.y - (sorted[i].y + sorted[i].h))));
            frame.itemSpacing = Math.min(...gaps);
        }
    }
    else {
        frame.paddingLeft = Math.max(0, Math.round(sorted[0].x));
        if (sorted.length > 1) {
            const gaps = sorted.slice(1).map((p, i) => Math.max(0, Math.round(p.x - (sorted[i].x + sorted[i].w))));
            frame.itemSpacing = Math.min(...gaps);
        }
    }
}
function wrapInList(frame, instances) {
    const list = figma.createFrame();
    list.name = 'List';
    list.fills = [];
    list.clipsContent = false;
    const direction = frame.layoutMode !== 'NONE'
        ? frame.layoutMode
        : inferDirection(instances);
    list.layoutMode = direction;
    list.primaryAxisSizingMode = 'AUTO';
    list.counterAxisSizingMode = 'AUTO';
    list.primaryAxisAlignItems = 'MIN';
    list.counterAxisAlignItems = 'MIN';
    if (frame.itemSpacing)
        list.itemSpacing = frame.itemSpacing;
    const frameChildren = [...frame.children];
    const firstIndex = frameChildren.indexOf(instances[0]);
    frame.insertChild(firstIndex, list);
    for (const inst of instances)
        list.appendChild(inst);
    return list;
}
async function applyStructureFix(nodeId) {
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node || node.type !== 'FRAME')
        throw new Error('노드를 찾을 수 없어요.');
    const frame = node;
    const children = [...frame.children];
    const ops = [];
    // Screen 레벨: Body 이름 오류 → rename
    if (frame.parent && frame.parent.type === 'FRAME' && isScreen(frame.parent)) {
        ops.push({ op: 'rename', nodeId: frame.id, name: frame.name });
        frame.name = 'Body';
        return ops;
    }
    // Screen 레벨: Body 없음 → non-structural children을 Body로 묶기
    if (isScreen(frame)) {
        const EXCLUDE = ['header', 'footer'];
        const categorized = [];
        for (const child of children) {
            categorized.push({ node: child, slot: await categorizeScreenChild(child) });
        }
        const toWrap = categorized.filter(c => !EXCLUDE.includes(c.slot)).map(c => c.node);
        if (toWrap.length === 0)
            throw new Error('묶을 레이어가 없어요.');
        // 자식 위치 스냅샷 (auto layout 적용 전 절대 좌표 보존)
        const childPositions = toWrap.map(c => ({
            id: c.id,
            x: c.x,
            y: c.y,
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
        for (const child of toWrap)
            body.appendChild(child);
        ops.push({ op: 'unwrap-list', parentId: frame.id, listId: body.id, childPositions });
        return ops;
    }
    // List가 Area 없이 직접 있는 경우 → Area로 감싸기
    if (frame.name === 'List' &&
        frame.parent &&
        frame.parent.type === 'FRAME' &&
        !frame.parent.name.endsWith('Area')) {
        const parentFrame = frame.parent;
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
        const frameIndex = [...parentFrame.children].indexOf(frame);
        const area = figma.createFrame();
        area.name = compName + ' Area';
        area.fills = [];
        area.clipsContent = false;
        area.layoutMode = parentFrame.layoutMode !== 'NONE' ? parentFrame.layoutMode : 'VERTICAL';
        area.primaryAxisSizingMode = 'AUTO';
        area.counterAxisSizingMode = 'AUTO';
        area.primaryAxisAlignItems = 'MIN';
        area.counterAxisAlignItems = 'MIN';
        parentFrame.insertChild(frameIndex, area);
        area.appendChild(frame);
        ops.push({ op: 'unwrap-list', parentId: parentFrame.id, listId: area.id });
        return ops;
    }
    // 중첩 Area → 최상위 Area ungroup
    if (frame.name.endsWith('Area')) {
        // 조상 중 가장 상위 Area를 찾음
        let topArea = frame;
        let cursor = frame.parent;
        while (cursor && cursor.type !== 'PAGE') {
            if (cursor.type === 'FRAME' && cursor.name.endsWith('Area')) {
                topArea = cursor;
            }
            cursor = cursor.parent;
        }
        if (topArea !== frame && topArea.parent && topArea.parent.type === 'FRAME') {
            const parentFrame = topArea.parent;
            const topIndex = [...parentFrame.children].indexOf(topArea);
            ops.push({ op: 'rewrap-area', parentId: parentFrame.id, insertIndex: topIndex, snap: snapshotFrame(topArea), parentPaddingSnap: { pt: parentFrame.paddingTop, pb: parentFrame.paddingBottom, pl: parentFrame.paddingLeft, pr: parentFrame.paddingRight } });
            parentFrame.paddingTop += topArea.paddingTop;
            parentFrame.paddingBottom += topArea.paddingBottom;
            parentFrame.paddingLeft += topArea.paddingLeft;
            parentFrame.paddingRight += topArea.paddingRight;
            const kids = [...topArea.children];
            for (let i = kids.length - 1; i >= 0; i--)
                parentFrame.insertChild(topIndex, kids[i]);
            topArea.remove();
            return ops;
        }
    }
    // Auto Layout 적용
    if (frame.layoutMode === 'NONE') {
        ops.push({ op: 'remove-layout', nodeId: frame.id, snap: snapshotFrame(frame) });
        applyAutoLayout(frame);
    }
    // Instance 2개 이상이고 모두 동일 컴포넌트일 때만 List로 감싸기
    const instances = children.filter(c => c.type === 'INSTANCE');
    const hasListChild = children.some(c => c.type === 'FRAME' && c.name === 'List');
    if (instances.length >= 2 && !hasListChild && await isSameComponent(instances)) {
        const list = wrapInList(frame, instances);
        ops.push({ op: 'unwrap-list', parentId: frame.id, listId: list.id });
        return ops;
    }
    // 불필요한 wrapper → ungroup
    if (frame.parent && frame.parent.type === 'FRAME') {
        const parentFrame = frame.parent;
        if (isStructuralName(parentFrame.name) && !isStructuralName(frame.name)) {
            const frameIndex = [...parentFrame.children].indexOf(frame);
            ops.push({ op: 'rewrap-area', parentId: parentFrame.id, insertIndex: frameIndex, snap: snapshotFrame(frame), parentPaddingSnap: { pt: parentFrame.paddingTop, pb: parentFrame.paddingBottom, pl: parentFrame.paddingLeft, pr: parentFrame.paddingRight } });
            parentFrame.paddingTop += frame.paddingTop;
            parentFrame.paddingBottom += frame.paddingBottom;
            parentFrame.paddingLeft += frame.paddingLeft;
            parentFrame.paddingRight += frame.paddingRight;
            const kids = [...frame.children];
            for (let i = kids.length - 1; i >= 0; i--)
                parentFrame.insertChild(frameIndex, kids[i]);
            frame.remove();
        }
    }
    return ops;
}
function isTopBarName(name) {
    return (name.includes('top bar') ||
        name.includes('topbar') ||
        name.includes('app bar') ||
        name.includes('appbar') ||
        name.includes('navigation bar') ||
        name.includes('nav bar') ||
        name.includes('toolbar') ||
        name.includes('navigation') ||
        name.includes('top navigation'));
}
function isBottomBarName(name) {
    return (name.includes('bottom') ||
        name.includes('cta') ||
        name.includes('tab bar') ||
        name.includes('tabbar') ||
        name.includes('action bar'));
}
function isFooterBottomName(name) {
    return name.includes('indicator') || name.includes('keyboard');
}
async function categorizeScreenChild(child) {
    const layerName = child.name.toLowerCase();
    if (layerName === 'header')
        return 'header';
    if (layerName === 'footer')
        return 'footer';
    if (layerName.includes('body') && child.type === 'FRAME')
        return 'body';
    if (layerName.includes('status bar') || layerName.includes('statusbar'))
        return 'header';
    if (isTopBarName(layerName))
        return 'header';
    if (isFooterBottomName(layerName) || isBottomBarName(layerName))
        return 'footer';
    if (child.type === 'INSTANCE') {
        const comp = await child.getMainComponentAsync();
        const compName = (comp && comp.parent && comp.parent.type === 'COMPONENT_SET'
            ? comp.parent.name
            : comp ? comp.name : child.name).toLowerCase();
        if (isTopBarName(compName) || compName.includes('status bar'))
            return 'header';
        if (isFooterBottomName(compName) || isBottomBarName(compName))
            return 'footer';
    }
    return 'unknown';
}
async function isBottomSheet(node) {
    var _a;
    if (node.type !== 'INSTANCE')
        return false;
    const comp = await node.getMainComponentAsync();
    const name = (((_a = comp === null || comp === void 0 ? void 0 : comp.parent) === null || _a === void 0 ? void 0 : _a.type) === 'COMPONENT_SET' ? comp.parent.name : (comp === null || comp === void 0 ? void 0 : comp.name) || '').toLowerCase();
    return name.includes('bottom sheet');
}
async function checkBottomSheetSlot(inst, issues) {
    const children = [...inst.children];
    const frames = children.filter(c => c.type === 'FRAME');
    if (frames.length === 0)
        return;
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
async function checkScreenStructure(screen, issues) {
    const children = [...screen.children];
    // Bottom Sheet 분리
    const bottomSheets = [];
    const normalChildren = [];
    for (const child of children) {
        if (await isBottomSheet(child)) {
            bottomSheets.push(child);
        }
        else {
            normalChildren.push(child);
        }
    }
    // Bottom Sheet slot 검사
    for (const bs of bottomSheets) {
        await checkBottomSheetSlot(bs, issues);
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
    const SLOT_ORDER = ['header', 'body', 'footer'];
    const categorized = [];
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
        }
        else {
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
        if (idx < lastIdx) {
            orderViolation = true;
            break;
        }
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
        if (isTopBar)
            seenTopBarInHeader = true;
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
            const getIdx = (n) => normalChildren.indexOf(n);
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
async function detectEdgeCases(node, issues) {
    if (!node.visible) {
        issues.push({
            type: 'hidden-layer',
            message: `레이어가 숨겨져 있어서 오슬라이스가 내용을 파악할 수 없어요.`,
            nodeId: node.id,
            nodeName: node.name || '(이름 없음)',
        });
        return;
    }
    if (node.type === 'FRAME') {
        const frame = node;
        const children = [...frame.children];
        // Screen 구조 검사 (최상위 Frame만)
        if (isScreen(frame)) {
            await checkScreenStructure(frame, issues);
            for (const child of children)
                await detectEdgeCases(child, issues);
            return;
        }
        // List가 Area 없이 직접 구조 프레임에 있는 경우
        if (frame.name === 'List' &&
            frame.parent &&
            frame.parent.type === 'FRAME' &&
            !frame.parent.name.endsWith('Area')) {
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
            let ancestorArea = null;
            while (ancestor && ancestor.type !== 'PAGE') {
                if (ancestor.type === 'FRAME' && ancestor.name.endsWith('Area')) {
                    ancestorArea = ancestor;
                    break;
                }
                ancestor = ancestor.parent;
            }
            if (ancestorArea) {
                issues.push({
                    type: 'nested-area',
                    message: `"${ancestorArea.name}" 안에 "${frame.name}"이 중첩되어 있어요. Area는 Area 안에 있을 수 없어요.`,
                    nodeId: frame.id,
                    nodeName: frame.name || '(이름 없음)',
                });
                for (const child of children)
                    await detectEdgeCases(child, issues);
                return;
            }
        }
        // Body에 Area 없이 직접 인스턴스 → Area 그루핑 필요
        if (frame.name === 'Body') {
            const directInstances = children.filter(c => c.type === 'INSTANCE');
            if (directInstances.length > 0) {
                issues.push({
                    type: 'needs-area-grouping',
                    message: `Body 안에 Area 없이 컴포넌트 ${directInstances.length}개가 직접 배치되어 있어요. 가로 슬라이스 기준으로 Area를 생성해야 해요.`,
                    nodeId: frame.id,
                    nodeName: frame.name,
                });
                for (const child of children)
                    await detectEdgeCases(child, issues);
                return;
            }
        }
        // Body 내 padding 규칙 검사
        if (frame.parent &&
            frame.parent.type === 'FRAME' &&
            frame.parent.name === 'Body') {
            const siblings = [...frame.parent.children];
            const isFirst = siblings[0].id === frame.id;
            const isLast = siblings[siblings.length - 1].id === frame.id;
            // 최상단이 아닌 Area에 paddingTop이 있으면 불허
            if (!isFirst && frame.paddingTop > 0) {
                issues.push({
                    type: 'excess-top-padding',
                    message: `최상단 Area가 아닌데 상단 패딩(${frame.paddingTop}px)이 있어요. 위 프레임의 하단 패딩으로 이동해야 해요.`,
                    nodeId: frame.id,
                    nodeName: frame.name,
                });
            }
            // 최하단 Area는 하단 패딩 64 필수
            if (isLast && frame.paddingBottom !== 64) {
                issues.push({
                    type: 'missing-bottom-padding',
                    message: `Body 최하단 프레임의 하단 패딩이 ${frame.paddingBottom}px예요. 64px로 설정해야 해요.`,
                    nodeId: frame.id,
                    nodeName: frame.name,
                });
            }
            // 최하단이 아닌 Area에 하단 패딩이 있으면 제거
            if (!isLast && frame.paddingBottom > 0) {
                issues.push({
                    type: 'excess-bottom-padding',
                    message: `하단 패딩(${frame.paddingBottom}px)이 있어요. 제거해야 해요.`,
                    nodeId: frame.id,
                    nodeName: frame.name,
                });
            }
        }
        // 불필요한 이중 wrapper 감지
        // (1) Area 안의 비구조적 프레임, (2) 자식이 모두 Frame인 비구조적 wrapper
        if (frame.parent && frame.parent.type === 'FRAME' &&
            isStructuralName(frame.parent.name) &&
            !isStructuralName(frame.name) &&
            children.length > 0 &&
            (frame.parent.name.endsWith('Area') ||
                children.every(c => c.type === 'FRAME')) &&
            !issues.find(i => i.nodeId === frame.id)) {
            issues.push({
                type: 'redundant-wrapper',
                message: `"${frame.name}"은 불필요한 wrapper 프레임이에요. 안의 콘텐츠를 상위로 이동해야 해요.`,
                nodeId: frame.id,
                nodeName: frame.name || '(이름 없음)',
            });
            for (const child of children)
                await detectEdgeCases(child, issues);
            return;
        }
        // Auto Layout 없음
        if (frame.layoutMode === 'NONE') {
            issues.push({
                type: 'no-autolayout',
                message: `Auto Layout이 없어서 방향을 판단할 수 없어요.`,
                nodeId: node.id,
                nodeName: node.name,
            });
        }
        // Instance 2개 이상인데 List wrapper 없음
        if (frame.parent && frame.parent.type !== 'PAGE') {
            const instances = children.filter(c => c.type === 'INSTANCE');
            const hasListChild = children.some(c => c.type === 'FRAME' && c.name === 'List');
            const isListOrRow = frame.name === 'List' || frame.name === 'Row';
            if (instances.length >= 2 && !hasListChild && !isListOrRow && !issues.find(i => i.nodeId === frame.id)) {
                if (await isSameComponent(instances)) {
                    issues.push({
                        type: 'needs-list-wrapper',
                        message: `Instance ${instances.length}개가 List 없이 직접 포함되어 있어요. List 프레임으로 감싸야 해요.`,
                        nodeId: frame.id,
                        nodeName: frame.name || '(이름 없음)',
                    });
                }
            }
        }
        // 이름 검사
        if (frame.parent && frame.parent.type !== 'PAGE' && !issues.find(i => i.nodeId === frame.id)) {
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
        for (const child of children)
            await detectEdgeCases(child, issues);
        return;
    }
    if (node.type === 'INSTANCE') {
        const inst = node;
        // Bottom Sheet는 checkBottomSheetSlot에서 처리
        if (await isBottomSheet(inst))
            return;
        const instName = inst.name.toLowerCase();
        if (instName.includes('text')) {
            const instChildren = [...inst.children];
            const onlyText = instChildren.length > 0 && instChildren.every(c => c.type === 'TEXT');
            if (onlyText) {
                const textChild = instChildren[0];
                const boundVars = textChild.boundVariables;
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
        const textNode = node;
        const boundVars = textNode.boundVariables;
        const hasVar = boundVars && Object.keys(boundVars).length > 0;
        if (!hasVar) {
            issues.push({
                type: 'no-typography-variable',
                message: `Typography variable이 없어서 Title Area / Text Area를 판단할 수 없어요.`,
                nodeId: node.id,
                nodeName: node.name || '(이름 없음)',
            });
        }
        if (!isSnakeCase(node.name)) {
            issues.push({
                type: 'no-data-field-name',
                message: `데이터 필드명(snake_case)이 없어서 어떤 데이터인지 파악할 수 없어요.`,
                nodeId: node.id,
                nodeName: node.name || '(이름 없음)',
            });
        }
        return;
    }
    if (node.type === 'RECTANGLE' || node.type === 'ELLIPSE' || node.type === 'VECTOR' ||
        node.type === 'POLYGON' || node.type === 'STAR' || node.type === 'LINE' || node.type === 'BOOLEAN_OPERATION') {
        const expected = getShapeLabel(node);
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
async function fixExcessTopPadding(nodeId) {
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node || node.type !== 'FRAME')
        throw new Error('노드를 찾을 수 없어요.');
    const frame = node;
    if (!frame.parent || frame.parent.type !== 'FRAME')
        throw new Error('부모를 찾을 수 없어요.');
    const siblings = [...frame.parent.children];
    const idx = siblings.findIndex(c => c.id === frame.id);
    if (idx <= 0)
        throw new Error('이전 프레임이 없어요.');
    const prev = siblings[idx - 1];
    if (prev.type !== 'FRAME')
        throw new Error('이전 노드가 프레임이 아니에요.');
    const prevFrame = prev;
    const ops = [
        { op: 'remove-layout', nodeId: frame.id, snap: snapshotFrame(frame) },
        { op: 'remove-layout', nodeId: prevFrame.id, snap: snapshotFrame(prevFrame) },
    ];
    prevFrame.paddingBottom = prevFrame.paddingBottom + frame.paddingTop;
    frame.paddingTop = 0;
    return ops;
}
async function fixScreenAutoLayout(nodeId) {
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node || node.type !== 'FRAME')
        throw new Error('노드를 찾을 수 없어요.');
    const frame = node;
    const ops = [{ op: 'remove-layout', nodeId: frame.id, snap: snapshotFrame(frame) }];
    const children = [...frame.children];
    const withPos = children.map(c => ({ node: c, y: c.y }));
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
async function fixScreenScroll(nodeId) {
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node || node.type !== 'FRAME')
        throw new Error('노드를 찾을 수 없어요.');
    const frame = node;
    const ops = [{
            op: 'restore-scroll',
            nodeId,
            overflowDirection: frame.overflowDirection,
            numberOfFixedChildren: frame.numberOfFixedChildren,
        }];
    frame.overflowDirection = 'NONE';
    frame.numberOfFixedChildren = 0;
    return ops;
}
async function fixFooterCoexistence(nodeId) {
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node)
        throw new Error('노드를 찾을 수 없어요.');
    node.visible = false;
    return [{ op: 'show-node', nodeId }];
}
// ── Fix Handlers ───────────────────────────────────────────────────────────
async function fixMissingBottomPadding(nodeId) {
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node || node.type !== 'FRAME')
        throw new Error('노드를 찾을 수 없어요.');
    const frame = node;
    const ops = [{ op: 'remove-layout', nodeId: frame.id, snap: snapshotFrame(frame) }];
    frame.paddingBottom = 64;
    return ops;
}
async function fixExcessBottomPadding(nodeId) {
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node || node.type !== 'FRAME')
        throw new Error('노드를 찾을 수 없어요.');
    const frame = node;
    if (!frame.parent || frame.parent.type !== 'FRAME')
        throw new Error('부모를 찾을 수 없어요.');
    const siblings = [...frame.parent.children];
    const idx = siblings.findIndex(c => c.id === frame.id);
    if (idx === -1 || idx >= siblings.length - 1)
        throw new Error('다음 프레임이 없어요.');
    const next = siblings[idx + 1];
    if (next.type !== 'FRAME')
        throw new Error('다음 노드가 프레임이 아니에요.');
    const nextFrame = next;
    const ops = [
        { op: 'remove-layout', nodeId: frame.id, snap: snapshotFrame(frame) },
        { op: 'remove-layout', nodeId: nextFrame.id, snap: snapshotFrame(nextFrame) },
    ];
    nextFrame.paddingTop = nextFrame.paddingTop + frame.paddingBottom;
    frame.paddingBottom = 0;
    return ops;
}
async function fixWrongAreaName(nodeId) {
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node)
        throw new Error('노드를 찾을 수 없어요.');
    const sceneNode = node;
    const oldName = sceneNode.name;
    const shapeTypes = ['RECTANGLE', 'ELLIPSE', 'VECTOR', 'POLYGON', 'STAR', 'LINE', 'BOOLEAN_OPERATION'];
    if (shapeTypes.includes(node.type)) {
        sceneNode.name = getShapeLabel(sceneNode);
        return [{ op: 'rename', nodeId, name: oldName }];
    }
    if (node.type !== 'FRAME')
        throw new Error('노드를 찾을 수 없어요.');
    const frame = node;
    const newName = await computeFrameName(frame);
    if (newName)
        frame.name = newName;
    return [{ op: 'rename', nodeId, name: oldName }];
}
// ── Node Tree & Claude ─────────────────────────────────────────────────────
async function extractNodeTree(node) {
    const base = {
        id: node.id,
        name: node.name,
        type: node.type,
        visible: node.visible,
    };
    if (node.type === 'FRAME') {
        const frame = node;
        base.layoutMode = frame.layoutMode;
        base.children = await Promise.all(frame.children.map(child => extractNodeTree(child)));
    }
    if (node.type === 'INSTANCE') {
        const instance = node;
        base.componentName = await getCompName(instance);
        base.children = await Promise.all(instance.children.map(child => extractNodeTree(child)));
    }
    if (node.type === 'TEXT') {
        const textNode = node;
        base.characters = textNode.characters;
        const boundVars = textNode.boundVariables;
        if (boundVars)
            base.boundVariables = boundVars;
    }
    return base;
}
// ── Message Handler ────────────────────────────────────────────────────────
figma.ui.onmessage = async (msg) => {
    if (msg.type === 'validate') {
        try {
            const selection = figma.currentPage.selection;
            if (selection.length === 0) {
                figma.ui.postMessage({ type: 'error', message: 'Frame을 선택해주세요.' });
                return;
            }
            lastValidatedId = selection[0].id;
            const issues = [];
            await detectEdgeCases(selection[0], issues);
            figma.ui.postMessage({ type: 'validate-result', issues });
        }
        catch (e) {
            console.error('[O!Slice] Validate error:', e);
            figma.ui.postMessage({ type: 'error', message: `Validate 오류: ${e.message}` });
        }
    }
    if (msg.type === 'fix-naming' && msg.nodeId) {
        figma.ui.postMessage({ type: 'rebuild-loading', nodeId: msg.nodeId });
        try {
            const revertOps = await fixWrongAreaName(msg.nodeId);
            figma.ui.postMessage({ type: 'rebuild-done', nodeId: msg.nodeId, revertOps });
        }
        catch (e) {
            console.error('[O!Slice] Fix naming error:', e);
            figma.ui.postMessage({ type: 'rebuild-error', nodeId: msg.nodeId, message: e.message });
        }
    }
    if (msg.type === 'fix-structure' && msg.nodeId) {
        figma.ui.postMessage({ type: 'rebuild-loading', nodeId: msg.nodeId });
        try {
            const issueType = msg.issueType;
            const revertOps = issueType === 'needs-area-grouping'
                ? await applyAreaGroupingById(msg.nodeId)
                : issueType === 'excess-bottom-padding'
                    ? await fixExcessBottomPadding(msg.nodeId)
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
                                        : await applyStructureFix(msg.nodeId);
            figma.ui.postMessage({ type: 'rebuild-done', nodeId: msg.nodeId, revertOps });
        }
        catch (e) {
            console.error('[O!Slice] Fix structure error:', e);
            figma.ui.postMessage({ type: 'rebuild-error', nodeId: msg.nodeId, message: e.message });
        }
    }
    if (msg.type === 'fix-all-structure' && msg.items) {
        const items = msg.items;
        for (const item of items) {
            figma.ui.postMessage({ type: 'rebuild-loading', nodeId: item.nodeId });
            try {
                const revertOps = item.issueType === 'needs-area-grouping'
                    ? await applyAreaGroupingById(item.nodeId)
                    : item.issueType === 'excess-bottom-padding'
                        ? await fixExcessBottomPadding(item.nodeId)
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
                                            : await applyStructureFix(item.nodeId);
                figma.ui.postMessage({ type: 'rebuild-done', nodeId: item.nodeId, revertOps });
            }
            catch (e) {
                figma.ui.postMessage({ type: 'rebuild-error', nodeId: item.nodeId, message: e.message });
            }
        }
        figma.ui.postMessage({ type: 'fix-all-done' });
    }
    if (msg.type === 'fix-all-naming' && msg.nodeIds) {
        const nodeIds = msg.nodeIds;
        for (const nodeId of nodeIds) {
            figma.ui.postMessage({ type: 'rebuild-loading', nodeId });
            try {
                const revertOps = await fixWrongAreaName(nodeId);
                figma.ui.postMessage({ type: 'rebuild-done', nodeId, revertOps });
            }
            catch (e) {
                figma.ui.postMessage({ type: 'rebuild-error', nodeId, message: e.message });
            }
        }
        figma.ui.postMessage({ type: 'fix-all-done' });
    }
    if (msg.type === 'revert' && msg.revertOps) {
        try {
            await applyRevert(msg.revertOps);
            figma.ui.postMessage({ type: 'revert-done', nodeId: msg.nodeId });
        }
        catch (e) {
            console.error('[O!Slice] Revert error:', e);
            figma.ui.postMessage({ type: 'rebuild-error', nodeId: msg.nodeId, message: `원복 오류: ${e.message}` });
        }
    }
    if (msg.type === 'delete-node' && msg.nodeId) {
        try {
            const node = await figma.getNodeByIdAsync(msg.nodeId);
            if (node) {
                node.visible = false;
                const revertOps = [{ op: 'show-node', nodeId: msg.nodeId }];
                figma.ui.postMessage({ type: 'delete-done', nodeId: msg.nodeId, revertOps });
            }
        }
        catch (e) {
            console.error('[O!Slice] Delete error:', e);
            figma.ui.postMessage({ type: 'error', message: `삭제 오류: ${e.message}` });
        }
    }
    if (msg.type === 'confirm-delete' && msg.nodeId) {
        try {
            const node = await figma.getNodeByIdAsync(msg.nodeId);
            if (node)
                node.remove();
        }
        catch (_) { }
    }
    if (msg.type === 'save-known' && msg.knownIds) {
        await figma.clientStorage.setAsync('knownIssues', msg.knownIds);
    }
    if (msg.type === 'select-node' && msg.nodeId) {
        try {
            const node = await figma.getNodeByIdAsync(msg.nodeId);
            if (node && !node.removed) {
                pluginSelecting = true;
                figma.currentPage.selection = [node];
                figma.viewport.scrollAndZoomIntoView([node]);
                pluginSelecting = false;
            }
        }
        catch (_) { }
    }
    if (msg.type === 'cancel') {
        figma.closePlugin();
    }
};
