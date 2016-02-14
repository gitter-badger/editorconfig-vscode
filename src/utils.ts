import * as editorconfig from 'editorconfig';
import {EditorSettings} from './interfaces/editorSettings';
import {window, workspace, TextDocument, TextEditor} from 'vscode';

export class Utils {

	/**
	 * Convert .editorconfig values to vscode editor options
	 */
	public static fromEditorConfig(config: editorconfig.knownProps, defaults: EditorSettings): any {
		return {
			insertSpaces: config.indent_style ? config.indent_style !== 'tab' : defaults.insertSpaces,
			tabSize: config.tab_width || config.indent_size || defaults.tabSize
		};
	}

	/**
	 * Convert vscode editor options to .editorconfig values
	 */
	public static toEditorConfig(options: EditorSettings) {
		const result: editorconfig.knownProps = {};

		switch (options.insertSpaces) {
			case true:
				result.indent_style = 'space';
				result.indent_size = Utils.resolveTabSize(options.tabSize);
				break;
			case false:
			case 'auto':
				result.indent_style = 'tab';
				result.tab_width = Utils.resolveTabSize(options.tabSize);
				break;
		}

		return result;
	}

	/**
	 * Convert vscode tabSize option into numeric value
	 */
	public static resolveTabSize(tabSize: number|string) {
		return (tabSize === 'auto') ? 4 : parseInt(tabSize + '', 10);
	}

	/**
	 * Retrieve the current active text editor.
	 */
	public static findEditor(textDocument: TextDocument): TextEditor {
		for (const editor of window.visibleTextEditors) {
			if (editor.document === textDocument) {
				return editor;
			}
		}

		return null;
	}
}
