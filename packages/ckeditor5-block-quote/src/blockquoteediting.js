/**
 * @license Copyright (c) 2003-2020, CKSource - Frederico Knabben. All rights reserved.
 * For licensing, see LICENSE.md or https://ckeditor.com/legal/ckeditor-oss-license
 */

/**
 * @module block-quote/blockquoteediting
 */

import Plugin from '@ckeditor/ckeditor5-core/src/plugin';

import BlockQuoteCommand from './blockquotecommand';
import EnterModelObserver from '@ckeditor/ckeditor5-enter/src/entermodelobserver';
import Enter from '@ckeditor/ckeditor5-enter/src/enter';
import DeleteModelObserver from '@ckeditor/ckeditor5-typing/src/deletemodelobserver';
import Delete from '@ckeditor/ckeditor5-typing/src/delete';

/**
 * The block quote editing.
 *
 * Introduces the `'blockQuote'` command and the `'blockQuote'` model element.
 *
 * @extends module:core/plugin~Plugin
 */
export default class BlockQuoteEditing extends Plugin {
	/**
	 * @inheritDoc
	 */
	static get pluginName() {
		return 'BlockQuoteEditing';
	}

	/**
	 * @inheritDoc
	 */
	static get requires() {
		return [ Enter, Delete ];
	}

	/**
	 * @inheritDoc
	 */
	init() {
		const editor = this.editor;
		const schema = editor.model.schema;

		editor.commands.add( 'blockQuote', new BlockQuoteCommand( editor ) );

		schema.register( 'blockQuote', {
			allowWhere: '$block',
			allowContentOf: '$root'
		} );

		// Disallow blockQuote in blockQuote.
		schema.addChildCheck( ( ctx, childDef ) => {
			if ( ctx.endsWith( 'blockQuote' ) && childDef.name == 'blockQuote' ) {
				return false;
			}
		} );

		editor.conversion.elementToElement( { model: 'blockQuote', view: 'blockquote' } );

		// Postfixer which cleans incorrect model states connected with block quotes.
		editor.model.document.registerPostFixer( writer => {
			const changes = editor.model.document.differ.getChanges();

			for ( const entry of changes ) {
				if ( entry.type == 'insert' ) {
					const element = entry.position.nodeAfter;

					if ( !element ) {
						// We are inside a text node.
						continue;
					}

					if ( element.is( 'element', 'blockQuote' ) && element.isEmpty ) {
						// Added an empty blockQuote - remove it.
						writer.remove( element );

						return true;
					} else if ( element.is( 'element', 'blockQuote' ) && !schema.checkChild( entry.position, element ) ) {
						// Added a blockQuote in incorrect place - most likely inside another blockQuote. Unwrap it
						// so the content inside is not lost.
						writer.unwrap( element );

						return true;
					} else if ( element.is( 'element' ) ) {
						// Just added an element. Check its children to see if there are no nested blockQuotes somewhere inside.
						const range = writer.createRangeIn( element );

						for ( const child of range.getItems() ) {
							if (
								child.is( 'element', 'blockQuote' ) &&
								!schema.checkChild( writer.createPositionBefore( child ), child )
							) {
								writer.unwrap( child );

								return true;
							}
						}
					}
				} else if ( entry.type == 'remove' ) {
					const parent = entry.position.parent;

					if ( parent.is( 'element', 'blockQuote' ) && parent.isEmpty ) {
						// Something got removed and now blockQuote is empty. Remove the blockQuote as well.
						writer.remove( parent );

						return true;
					}
				}
			}

			return false;
		} );

		const selection = editor.model.document.selection;
		const blockQuoteCommand = editor.commands.get( 'blockQuote' );

		const enterObserver = editor.editing.getObserver( EnterModelObserver ).for( 'blockQuote' );

		// Overwrite default Enter key behavior.
		// If Enter key is pressed with selection collapsed in empty block inside a quote, break the quote.
		this.listenTo( enterObserver, 'enter', ( evt, data ) => {
			if ( !selection.isCollapsed || !blockQuoteCommand.value ) {
				return;
			}

			const positionParent = selection.getLastPosition().parent;

			if ( positionParent.isEmpty ) {
				editor.execute( 'blockQuote' );
				editor.editing.view.scrollToTheSelection();

				data.preventDefault();
				evt.stop();
			}
		} );

		const deleteObserver = editor.editing.getObserver( DeleteModelObserver ).for( 'blockQuote' );

		// Overwrite default Backspace key behavior.
		// If Backspace key is pressed with selection collapsed in first empty block inside a quote, break the quote.
		this.listenTo( deleteObserver, 'delete', ( evt, data ) => {
			if ( data.direction != 'backward' || !selection.isCollapsed || !blockQuoteCommand.value ) {
				return;
			}

			const positionParent = selection.getLastPosition().parent;

			if ( positionParent.isEmpty && !positionParent.previousSibling ) {
				editor.execute( 'blockQuote' );
				editor.editing.view.scrollToTheSelection();

				data.preventDefault();
				evt.stop();
			}
		} );
	}
}
