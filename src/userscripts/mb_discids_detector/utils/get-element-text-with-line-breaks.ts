export function getElementTextWithLineBreaks(element: Element): string {
    const lines: string[] = [];
    let currentLine = '';

    const flushLine = (): void => {
        lines.push(currentLine);
        currentLine = '';
    };

    const walk = (node: Node): void => {
        if (node.nodeType === Node.TEXT_NODE) {
            currentLine += node.textContent ?? '';
            return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) {
            return;
        }

        const tagName = (node as Element).tagName.toUpperCase();
        if (tagName === 'BR') {
            flushLine();
            return;
        }

        for (const child of node.childNodes) {
            walk(child);
        }
    };

    walk(element);
    if (currentLine.length > 0 || lines.length === 0) {
        lines.push(currentLine);
    }

    return lines.join('\n');
}
