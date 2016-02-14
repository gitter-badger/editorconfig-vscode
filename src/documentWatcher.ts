import * as editorconfig from 'editorconfig';
import {basename} from 'path';
import {window, workspace, Disposable, TextDocument, TextEditor} from 'vscode';
import {Utils} from './utils';
import {transform as trimTrailingWhitespaceTransform} from './transformations/trimTrailingWhitespace';
import {transform as insertFinalNewlineTransform} from './transformations/insertFinalNewline';
import {IEditorConfigProvider} from './interfaces/editorConfigProvider';
import {EditorSettings} from './interfaces/editorSettings';

/**
 * Listens to vscode document open and maintains a map (Document => editor config settings)
 */
export class DocumentWatcher implements IEditorConfigProvider {

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

	public getSettingsForDocument(document: TextDocument): editorconfig.knownProps {
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

function applyOnSaveTransformations(textDocument:TextDocument, provider:IEditorConfigProvider): void {
	const editorconfig = provider.getSettingsForDocument(textDocument);

	if (!editorconfig) {
		// no configuration found for this file
		return;
	}

	const editor = Utils.findEditor(textDocument);

	if (!editor) {
		return;
	}

	trimTrailingWhitespaceTransform(editorconfig, editor, textDocument)
		.then(() => insertFinalNewlineTransform(editorconfig, editor, textDocument))
		.then(() => textDocument.save());
}


function applyEditorConfigToTextEditor(textEditor:TextEditor, provider:IEditorConfigProvider): void {
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

	window.setStatusBarMessage(`EditorConfig: ${spacesOrTabs}: ${newOptions.tabSize}`, 1500);

	textEditor.options = newOptions;
}

