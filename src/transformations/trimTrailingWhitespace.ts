import * as editorconfig from 'editorconfig';
import {workspace, TextEditor, TextDocument, TextLine, Position, Range} from 'vscode';
import {EditorSettings} from '../interfaces/editorSettings';

/**
 * Transform the textdocument by trimming the trailing whitespace.
 */
export function transform(editorconfig: editorconfig.knownProps, editor: TextEditor, textDocument: TextDocument): Thenable<any> {
	const editorTrimsWhitespace = workspace.getConfiguration('files').get('trimTrailingWhitespace', false);

	if (editorTrimsWhitespace || !editorconfig.trim_trailing_whitespace) {
		return Promise.resolve();
	}

	const trimmingOperations = [];

	for (let i = 0; i < textDocument.lineCount; i++) {
		trimmingOperations.push(trimLineTrailingWhitespace(textDocument.lineAt(i)));
	}

	return Promise.all(trimmingOperations);

	function trimLineTrailingWhitespace(line: TextLine) {
		const trimmedLine = trimTrailingWhitespace(line.text);
		if (trimmedLine === line.text) {
			return;
		}

		return editor.edit(edit => {
			const whitespaceBegin = new Position(line.lineNumber, trimmedLine.length);
			const whitespaceEnd = new Position(line.lineNumber, line.text.length);
			const whitespace = new Range(whitespaceBegin, whitespaceEnd);
			edit.delete(whitespace);
		});
	}
}

function trimTrailingWhitespace(input: string): string {
	return input.replace(/[\s\uFEFF\xA0]+$/g, '');
}
