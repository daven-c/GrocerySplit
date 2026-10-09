import axe from 'axe-core';

/**
 * Run axe-core on what is currently rendered and return a readable list of problems.
 * Colour contrast needs real layout, which jsdom doesn't have, so that one rule is left to the colour tokens.
 */
// axe probes <canvas> for a couple of rules; jsdom has none and only logs that, so give it a quiet stub.
if (typeof HTMLCanvasElement !== 'undefined') (HTMLCanvasElement.prototype as any).getContext = () => null;

export async function a11yProblems(root: Element = document.body): Promise<string[]> {
    const results = await axe.run(root, { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } });
    return results.violations.map(v => `${v.id} (${v.impact}): ${v.help} -> ${v.nodes.slice(0, 3).map(n => n.html.slice(0, 110)).join(' | ')}`);
}
