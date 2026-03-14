export function luceneEscape(text: string): string {
    let newText = text.replace(/[-[\]{}()*+?~:\\^!"/]/g, '\\$&');
    newText = newText.replace('&&', '&&').replace('||', '||');
    return newText;
}
