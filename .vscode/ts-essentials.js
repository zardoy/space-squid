const plugin = (/** @type {{ts: typeof import('typescript'), LanguageService: import('typescript').LanguageService}} */{ts, utils, ls}) => {
    /** @type {import('typescript').LanguageService} */
    const proxy = {
        getDefinitionAndBoundSpan(fileName, position) {
            const defs = ls.getDefinitionAndBoundSpan(fileName, position)
            const def = defs?.definitions?.[0]
            if (!def) return defs
            const sourceFile = ls.getProgram().getSourceFile(fileName)
            const node = utils.getNodeAtPosition(sourceFile, position)
            if (!node || !ts.isPropertyAccessExpression(node.parent) || !ts.isIdentifier(node.parent.expression)) return defs
            if (!['serv', 'player', 'entity'].includes(node.parent.expression.text)) return defs
            const res = ls.getReferencesAtPosition(fileName, position)
            const writes = res.filter(re => re.isWriteAccess && re.textSpan.start !== def.textSpan.start)
            if (!writes.length) return defs
            return {
                textSpan: defs.textSpan,
                definitions: writes.map(write => ({
                    ...write,
                    containerKind: '',
                }))
            }
        }
    }
    return proxy
}

module.exports = plugin
