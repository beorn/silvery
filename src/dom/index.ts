/**
 * DOM Entry Point
 *
 * Provides a browser-friendly API for rendering inkx components to DOM elements.
 * This module sets up the DOM adapter and provides render functions.
 *
 * Advantages over Canvas:
 * - Native text selection and copying
 * - Screen reader accessibility
 * - Browser font rendering
 * - CSS integration
 *
 * @example
 * ```tsx
 * import { renderToDOM, Box, Text, useContentRect } from 'inkx/dom';
 *
 * function App() {
 *   const { width, height } = useContentRect();
 *   return (
 *     <Box flexDirection="column">
 *       <Text>Container size: {width}px × {height}px</Text>
 *     </Box>
 *   );
 * }
 *
 * const container = document.getElementById('app');
 * renderToDOM(<App />, container);
 * ```
 */

import type { ReactElement } from 'react';
import {
	type DOMAdapterConfig,
	DOMRenderBuffer,
	createDOMAdapter,
	injectDOMStyles,
} from '../adapters/dom-adapter.js';
import { createFlexxZeroEngine } from '../adapters/flexx-zero-adapter.js';
import { setLayoutEngine } from '../layout-engine.js';
import { executeRenderAdapter } from '../pipeline/index.js';
import { createContainer, getContainerRoot, reconciler } from '../reconciler.js';
import { setRenderAdapter } from '../render-adapter.js';
import type { RenderBuffer } from '../render-adapter.js';

// Re-export components and hooks for convenience
export { Box, type BoxProps } from '../components/Box.js';
export { Text, type TextProps } from '../components/Text.js';
export { useContentRect, useScreenRect } from '../hooks/useLayout.js';
export { useApp } from '../hooks/useApp.js';

// Re-export adapter utilities
export {
	createDOMAdapter,
	DOMRenderBuffer,
	injectDOMStyles,
	type DOMAdapterConfig,
} from '../adapters/dom-adapter.js';

// ============================================================================
// Types
// ============================================================================

export interface DOMRenderOptions extends DOMAdapterConfig {
	/** Width of the container (default: container.clientWidth or 800) */
	width?: number;
	/** Height of the container (default: container.clientHeight or 600) */
	height?: number;
	/** Inject global CSS styles (default: true) */
	injectStyles?: boolean;
}

export interface DOMInstance {
	/** Re-render with a new element */
	rerender: (element: ReactElement) => void;
	/** Unmount and clean up */
	unmount: () => void;
	/** Get the current buffer */
	getBuffer: () => RenderBuffer | null;
	/** Force a re-render */
	refresh: () => void;
	/** Get the container element */
	getContainer: () => HTMLElement;
}

// ============================================================================
// Initialization
// ============================================================================

let initialized = false;

/**
 * Initialize the DOM rendering system.
 * Called automatically by renderToDOM, but can be called manually.
 */
export function initDOMRenderer(config: DOMAdapterConfig = {}): void {
	if (initialized) return;

	// Set up layout engine (Flexx is sync, no WASM needed)
	setLayoutEngine(createFlexxZeroEngine());

	// Set up DOM adapter
	setRenderAdapter(createDOMAdapter(config));

	initialized = true;
}

// ============================================================================
// Render Functions
// ============================================================================

/**
 * Render a React element to a DOM container.
 *
 * @param element - React element to render
 * @param container - Target DOM element
 * @param options - Render options (font size, colors, etc.)
 * @returns DOMInstance for controlling the render
 *
 * @example
 * ```tsx
 * const container = document.getElementById('app');
 * const instance = renderToDOM(<App />, container, { fontSize: 16 });
 *
 * // Later: update the component
 * instance.rerender(<App newProps />);
 *
 * // Clean up
 * instance.unmount();
 * ```
 */
export function renderToDOM(
	element: ReactElement,
	container: HTMLElement,
	options: DOMRenderOptions = {},
): DOMInstance {
	const { injectStyles = true, ...adapterConfig } = options;

	// Inject global styles if requested
	if (injectStyles) {
		injectDOMStyles(adapterConfig.classPrefix);
	}

	// Initialize if needed
	initDOMRenderer(adapterConfig);

	const width = options.width ?? (container.clientWidth || 800);
	const height = options.height ?? (container.clientHeight || 600);

	// Create reconciler container
	const inkxContainer = createContainer(() => {
		// Schedule re-render on state changes
		scheduleRender();
	});

	const root = getContainerRoot(inkxContainer);

	// Create fiber root
	const fiberRoot = reconciler.createContainer(
		inkxContainer,
		0, // LegacyRoot
		null,
		false,
		null,
		'',
		() => {},
		() => {},
		() => {},
		null,
	);

	let currentBuffer: RenderBuffer | null = null;
	let currentElement: ReactElement = element;
	let renderScheduled = false;

	function scheduleRender(): void {
		if (renderScheduled) return;
		renderScheduled = true;

		// Use requestAnimationFrame for smooth rendering
		if (typeof requestAnimationFrame !== 'undefined') {
			requestAnimationFrame(() => {
				renderScheduled = false;
				doRender();
			});
		} else {
			setTimeout(() => {
				renderScheduled = false;
				doRender();
			}, 0);
		}
	}

	function doRender(): void {
		// Update React tree
		reconciler.updateContainerSync(currentElement, fiberRoot, null, null);
		reconciler.flushSyncWork();

		// Execute render pipeline
		const prevBuffer = currentBuffer;
		const result = executeRenderAdapter(root, width, height, prevBuffer);
		currentBuffer = result.buffer;

		// Set container and render to DOM
		if (currentBuffer instanceof DOMRenderBuffer) {
			currentBuffer.setContainer(container);
			currentBuffer.render();
		}
	}

	// Initial render
	doRender();

	return {
		rerender(newElement: ReactElement): void {
			currentElement = newElement;
			scheduleRender();
		},

		unmount(): void {
			reconciler.updateContainer(null, fiberRoot, null, () => {});
			container.innerHTML = '';
		},

		getBuffer(): RenderBuffer | null {
			return currentBuffer;
		},

		refresh(): void {
			scheduleRender();
		},

		getContainer(): HTMLElement {
			return container;
		},
	};
}

/**
 * Render a React element to DOM once and return the HTML string.
 * Useful for server-side rendering or static generation.
 *
 * @param element - React element to render
 * @param width - Container width in pixels
 * @param height - Container height in pixels
 * @param options - Render options
 * @returns HTML string representation
 */
export function renderDOMOnce(
	element: ReactElement,
	width: number,
	height: number,
	options: DOMAdapterConfig = {},
): string {
	// Initialize if needed
	initDOMRenderer(options);

	// Create reconciler container
	const container = createContainer(() => {});
	const root = getContainerRoot(container);

	// Create fiber root and render
	const fiberRoot = reconciler.createContainer(
		container,
		0,
		null,
		false,
		null,
		'',
		() => {},
		() => {},
		() => {},
		null,
	);

	reconciler.updateContainerSync(element, fiberRoot, null, null);
	reconciler.flushSyncWork();

	// Execute render pipeline
	const { buffer } = executeRenderAdapter(root, width, height, null);

	// Clean up React
	reconciler.updateContainer(null, fiberRoot, null, () => {});

	// Generate HTML (would need a temp element in browser)
	if (typeof document !== 'undefined') {
		const tempContainer = document.createElement('div');
		(buffer as DOMRenderBuffer).setContainer(tempContainer);
		(buffer as DOMRenderBuffer).render();
		return tempContainer.innerHTML;
	}

	return '<!-- DOM rendering requires browser environment -->';
}
