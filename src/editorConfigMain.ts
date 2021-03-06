import * as editorconfig from 'editorconfig';
import { exists, writeFile } from 'fs';
import { basename } from 'path';
import {
	commands,
	Disposable,
	ExtensionContext,
	Position,
	Range,
	TextDocument,
	TextEdit,
	TextEditor,
	TextEditorOptions,
	TextLine,
	window,
	workspace
} from 'vscode';

export function activate(ctx: ExtensionContext): void {
	ctx.subscriptions.push(new DocumentWatcher());

	// register a command handler to generate a .editorconfig file
	commands.registerCommand('vscode.generateeditorconfig', generateEditorConfig);
}

interface EditorSettings {
	tabSize: string | number,
	insertSpaces: string | boolean
}

interface IEditorConfigProvider {
	getSettingsForDocument(document: TextDocument): editorconfig.knownProps;
	getDefaultSettings(): any;
}

/**
 * Listens to vscode document open and maintains a map (Document => editor config settings)
 */
class DocumentWatcher implements IEditorConfigProvider {

	private _documentToConfigMap: { [uri: string]: editorconfig.knownProps };
	private _disposable: Disposable;
	private _defaults: EditorSettings;

	constructor() {

		const subscriptions: Disposable[] = [];

		// Listen for changes in the active text editor
		subscriptions.push(window.onDidChangeActiveTextEditor(textEditor => {
			if (textEditor && textEditor.document) {
				this._onDidOpenDocument(textEditor.document);
			}
		}));

		// Listen for changes in the configuration
		subscriptions.push(workspace.onDidChangeConfiguration(this._onConfigChanged.bind(this)));

		// Listen for saves to ".editorconfig" files and rebuild the map
		subscriptions.push(workspace.onDidSaveTextDocument(savedDocument => {
			if (basename(savedDocument.fileName) === '.editorconfig') {
				// Saved an .editorconfig file => rebuild map entirely and then apply the changes to the .editorconfig file itself
				this._rebuildConfigMap().then(applyOnSaveTransformations.bind(undefined, savedDocument, this));
				return;
			}
			applyOnSaveTransformations(savedDocument, this);
		}));

		// dispose event subscriptons upon disposal
		this._disposable = Disposable.from(...subscriptions);

		// Build the map (cover the case that documents were opened before my activation)
		this._rebuildConfigMap();

		// Load the initial workspace configuration
		this._onConfigChanged();
	}

	public dispose(): void {
		this._disposable.dispose();
	}

	public getSettingsForDocument(
		document: TextDocument
	): editorconfig.knownProps {
 		return this._documentToConfigMap[document.fileName];
	}

	public getDefaultSettings(): EditorSettings {
		return this._defaults;
	}

	private _rebuildConfigMap(): Thenable<void[]> {
		this._documentToConfigMap = {};
		return Promise.all(workspace.textDocuments.map(document => this._onDidOpenDocument(document)));
	}

	private _onDidOpenDocument(document: TextDocument): Thenable<void> {
		if (document.isUntitled) {
			// Does not have a fs path
			return Promise.resolve();
		}
		const path = document.fileName;

		if (this._documentToConfigMap[path]) {
			applyEditorConfigToTextEditor(window.activeTextEditor, this);
			return Promise.resolve();
		}

		return editorconfig.parse(path).then((config: editorconfig.knownProps) => {
			if (config.indent_size === 'tab') {
				config.indent_size = config.tab_width;
			}

			// console.log('storing ' + path + ' to ' + JSON.stringify(config, null, '\t'));
			this._documentToConfigMap[path] = config;

			applyEditorConfigToTextEditor(window.activeTextEditor, this);
		});
	}

	private _onConfigChanged(): void {
		this._defaults = {
			tabSize: workspace.getConfiguration('editor').get<string | number>('tabSize'),
			insertSpaces: workspace.getConfiguration('editor').get<string | boolean>('insertSpaces')
		};
	}
}

function applyEditorConfigToTextEditor(
	textEditor:TextEditor, provider:IEditorConfigProvider
): void {

	if (!textEditor) {
		// No more open editors
		return;
	}

	const doc = textEditor.document;
	const editorconfig = provider.getSettingsForDocument(doc);

	if (!editorconfig) {
		// no configuration found for this file
		return;
	}

	const newOptions: any = Utils.fromEditorConfig(editorconfig, provider.getDefaultSettings());

	const spacesOrTabs = newOptions.insertSpaces === 'auto' ? 'auto' : (newOptions.insertSpaces ? 'Spaces' : 'Tabs');
	window.setStatusBarMessage(
		`EditorConfig: ${spacesOrTabs}: ${newOptions.tabSize}`,
		1500
	);

	textEditor.options = newOptions;
}

function applyOnSaveTransformations(
	textDocument:TextDocument,
	provider:IEditorConfigProvider
): void {

	const editorconfig = provider.getSettingsForDocument(textDocument);

	if (!editorconfig) {
		// no configuration found for this file
		return;
	}

	const editor = findEditor(textDocument);
	if (!editor) {
		return;
	}

	trimTrailingWhitespaceTransform(editorconfig, editor, textDocument)
		.then(() => insertFinalNewlineTransform(editorconfig, editor, textDocument))
		.then(() => textDocument.save());
}

function insertFinalNewlineTransform(
	editorconfig: editorconfig.knownProps,
	editor: TextEditor,
	textDocument: TextDocument
): Thenable<any> {

	const lineCount = textDocument.lineCount;
	if (!editorconfig.insert_final_newline || lineCount === 0) {
		return Promise.resolve();
	}

	const lastLine = textDocument.lineAt(lineCount - 1);
	const lastLineLength = lastLine.text.length;
	if (lastLineLength < 1) {
		return Promise.resolve();
	}

	return editor.edit(edit => {
		const pos = new Position(lastLine.lineNumber, lastLineLength);
		return edit.insert(pos, newline(editorconfig));
	});
}

function trimTrailingWhitespaceTransform(
	editorconfig: editorconfig.knownProps,
	editor: TextEditor,
	textDocument: TextDocument
): Thenable<any> {

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

function newline(editorconfig: editorconfig.knownProps): string {
	return {
		cr: '\r',
		crlf: '\r\n'
	}[editorconfig.end_of_line.toLowerCase()] || '\n';
}

function findEditor(textDocument: TextDocument): TextEditor {
	for (const editor of window.visibleTextEditors) {
		if (editor.document === textDocument) {
			return editor;
		}
	}

	return null;
}

/**
 * Generate an .editorconfig file in the root of the workspace based on the current vscode settings.
 */
function generateEditorConfig() {
	if (!workspace.rootPath) {
		window.showInformationMessage(
			'Please open a folder before generating an .editorconfig file'
		);
		return;
	}

	const editorConfigurationNode = workspace.getConfiguration('editor');
	const settings = Utils.toEditorConfig({
		insertSpaces: editorConfigurationNode
			.get<string | boolean>('insertSpaces'),
		tabSize: editorConfigurationNode
			.get<string | number>('tabSize')
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
	exists(editorconfigFile, (exists) => {
		if (exists) {
			window.showInformationMessage(
				'An .editorconfig file already exists in your workspace.'
			);
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

export class Utils {

	/**
	 * Convert .editorconfig values to vscode editor options
	 */
	public static fromEditorConfig(
		config: editorconfig.knownProps,
		defaults: EditorSettings
	): any {
		return {
			insertSpaces: config.indent_style
				? config.indent_style !== 'tab'
				: defaults.insertSpaces,
			tabSize: config.tab_width || config.indent_size || defaults.tabSize
		};
	}

	/**
	 * Convert vscode editor options to .editorconfig values
	 */
	public static toEditorConfig(
		options: {
			insertSpaces: boolean|string;
			tabSize: number|string;
		}
	) {
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
}
