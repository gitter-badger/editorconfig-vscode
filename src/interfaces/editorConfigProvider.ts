import * as editorconfig from 'editorconfig';
import {TextDocument} from 'vscode';

export interface IEditorConfigProvider {
	getSettingsForDocument(document: TextDocument): editorconfig.knownProps;
	getDefaultSettings(): any;
}
