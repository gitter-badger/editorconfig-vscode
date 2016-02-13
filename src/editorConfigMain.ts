import {ExtensionContext, commands} from 'vscode';
import {DocumentWatcher} from './documentWatcher';
import {generateEditorConfig} from './commands/generateEditorConfig';

/**
 * Main entry
 */
export function activate(ctx: ExtensionContext): void {
	ctx.subscriptions.push(new DocumentWatcher());

	// register a command handler to generate a .editorconfig file
	commands.registerCommand('vscode.generateeditorconfig', generateEditorConfig);
}
