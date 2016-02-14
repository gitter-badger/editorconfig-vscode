import {exists, writeFile} from 'fs';
import {workspace, window} from 'vscode';
import {Utils} from '../utils';

/**
 * Generate an .editorconfig file in the root of the workspace based on the current vscode settings.
 */
export function generateEditorConfig() {
	if (!workspace.rootPath) {
		window.showInformationMessage('Please open a folder before generating an .editorconfig file');
		return;
	}

	const editorConfigurationNode = workspace.getConfiguration('editor');
	const settings = Utils.toEditorConfig({
		insertSpaces: editorConfigurationNode.get<string | boolean>('insertSpaces'),
		tabSize: editorConfigurationNode.get<string | number>('tabSize')
	});

	let fileContents =
	`root = true

[*]
`;

	[
		'indent_style',
		'indent_size',
		'tab_width'
	].forEach(setting => {
		if (settings.hasOwnProperty(setting)) {
			fileContents += `${setting} = ${settings[setting]}
`;
		}
	});

	const editorconfigFile = `${workspace.rootPath}/.editorconfig`;

	exists(editorconfigFile, exists => {
		if (exists) {
			window.showInformationMessage('A .editorconfig file already exists in your workspace.');
			return;
		}

		writeFile(editorconfigFile, fileContents, err => {
			if (err) {
				window.showErrorMessage(err.toString());
				return;
			}
		});
	});
}
