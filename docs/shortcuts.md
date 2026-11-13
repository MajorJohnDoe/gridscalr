# Keyboard shortcuts

On macOS, use `Cmd` wherever `Ctrl` is shown. The in-app reference is available from **Help → Keyboard shortcuts** or by pressing `?`.

In a **View-only** session, shortcuts that would change the project are ignored: tools other than Select and Pan, undo/redo, cut, paste, duplicate, delete, rename and nudges. Navigation, search, zoom, export and Save a copy keep working.

## Tools

| Action | Shortcut |
| --- | --- |
| Select | `V` |
| Pan | `H` |
| Calibrate | `K` |
| Length | `L` |
| Area | `A` |
| Count | `C` |
| Radius | `Q` |
| Diameter | `W` |
| Arc | `Z` |
| Angle | `E` |
| Slope | `J` |
| Volume | `M` |
| Pen | `P` |
| Line | `I` |
| Arrow | `U` |
| Rectangle | `R` |
| Ellipse | `O` |
| Highlight | `G` |
| Text note | `T` |
| Text box | `Shift+T` |
| Pipe / duct | `F` |
| Revision cloud | `D` |
| Callout | `N` |
| Stamp | `S` |
| Revision delta | `Y` |
| Symbol library | `B` |

## Drawing and editing

| Action | Shortcut |
| --- | --- |
| Finish current shape | `Enter` or double-click |
| Cancel draft / clear selection / return to Select | `Esc` |
| Delete selection or remove the last point | `Delete` or `Backspace` |
| Add or remove markups from the selection | `Shift` / `Ctrl` / `Cmd` + click, or marquee drag |
| Nudge selected item | Arrow keys |
| Nudge by 10 screen pixels | `Shift` + Arrow keys |
| Rename selected markup | `F2` |
| Rename the project | `F2` with nothing selected, or double-click the project name |
| Edit selected text or measurement label | Double-click with Select or Text tool |
| Copy / cut / paste markups | `Ctrl+C` / `Ctrl+X` / `Ctrl+V` |
| Paste an image from the clipboard | `Ctrl+V` when the clipboard contains an image |
| Duplicate selection | `Ctrl+D` |
| Lock / unlock selection | Context menu or Properties |
| Hide / show selection | Context menu or Properties |

## Workspace lists

The Pages, Layers and Markups lists share one interaction model:

- a row is focused with `Tab`, then moved through with `ArrowUp` / `ArrowDown`,
  `Home` and `End`;
- `Ctrl` / `Cmd` + click toggles a row in the selection and `Shift` + click
  selects the range from the anchor;
- `Shift+F10` or the Menu key opens the row menu, and `F2` renames where the
  list supports inline rename;
- a selected row is dragged by its grip handle, and a drop line shows where it
  lands; `Alt` + `ArrowUp` / `ArrowDown` moves it without a pointer, `Alt` +
  `Home` / `End` moves it to the start or end of its siblings. The Layers panel
  adds a tree: drop on the middle of a row to nest, and use `Alt` + `ArrowRight`
  / `Alt` + `ArrowLeft` to nest the focused layer or move it out of its group.
  Each move is announced to screen readers and is one undo step.

The Markups table is sorted and grouped rather than user-ordered, so it follows
the focus, selection, filter and collapse conventions but has no drag handle or
drop line.

## Pages panel

| Action | Shortcut |
| --- | --- |
| Open the page menu | `Shift+F10` or the Menu key |
| Move focus between page cards | `ArrowUp` / `ArrowDown` / `Home` / `End` |
| Select one page | Click, or `Shift` + click for a range |
| Add or remove a page from the selection | `Ctrl` / `Cmd` + click |
| Move the selected pages up / down | `Alt+Up` / `Alt+Down` |
| Move the selected pages to the start / end | `Alt+Home` / `Alt+End` |
| Move the selected pages with the mouse | Drag a selected card or its grip to the drop line |
| Insert a page before / after the current page | `Alt+PageUp` / `Alt+PageDown` |
| Move the current page to another position | `Alt+Shift+M` |
| Duplicate the current page with options | `Alt+Shift+D` |
| Delete the current page | `Alt+Shift+Delete` |
| Rename a page | Double-click the page title |

The page menu and the page shortcuts act on the current page. Inserting and
moving are one undo step each; duplicating and deleting are confirmed and
cannot be undone.

Dragging a card that is part of a multi-page selection moves the whole
selection. A drop that crosses into another source document shows the document
name on the drop line. Every drop writes one recovery checkpoint. `Alt` +
`Shift` + `M` moves the whole selection when the current page is part of it;
duplicate and delete stay per page because both are structural.

## Layers panel

| Action | Shortcut |
| --- | --- |
| Open the layer menu | `Shift+F10` or the Menu key |
| Move focus between layers | `ArrowUp` / `ArrowDown` / `Home` / `End` |
| Rename the focused layer | `F2`, or double-click its name |
| Make the focused layer the target layer | `Enter` or `Space` |
| Open or close the focused group | `ArrowRight` / `ArrowLeft` |
| Move the layer up / down among its siblings | `Alt+Up` / `Alt+Down` |
| Move the layer to the first / last sibling | `Alt+Home` / `Alt+End` |
| Nest the focused layer under the layer above it | `Alt+Right` |
| Move the focused layer out of its group | `Alt+Left` |
| Move the layer with the mouse | Drag the layer row or its grip to the drop line; drop on the middle of a row to nest |
| Select a whole layer row | Click, `Ctrl` / `Cmd` + click or `Shift` + click |
| Add or remove an item from the selection | `Ctrl` / `Cmd` + click |
| Select a range of items | `Shift` + click |

Layer movement stays inside the layer's own kind group: drawing layers and
measurement layers keep their separate stacks, and a drawing layer can never
become the parent of a measurement layer. A drop line shows where the row lands;
dropping on the middle of another row of the same kind nests it there and shows
the target group highlighted. Nesting and moving are each one undo step. The
search field narrows the list without changing the order; a filtered drag keeps
the layers it did not show in their existing slots, and a search opens the
ancestor path of every hit.

## Markups panel

| Action | Shortcut |
| --- | --- |
| Open the panel | `Ctrl+L` |
| Move focus between rows | `ArrowUp` / `ArrowDown` / `Home` / `End` |
| Select one row | Click, or `Shift` + click for a range |
| Add or remove a row from the selection | `Ctrl` / `Cmd` + click |
| Open the row menu | `Shift+F10` or the Menu key |
| Rename the focused markup | `F2` |
| Go to the focused markup | `Enter` or `Space` |

## View and navigation

| Action | Shortcut |
| --- | --- |
| Pan temporarily | Hold `Space` and drag |
| Zoom | `Ctrl` + mouse wheel, touchpad pinch, `Ctrl++` / `Ctrl+-` |
| Fit page | `Ctrl+0` |
| Actual size | `Ctrl+1` |
| Previous / next page | `PageUp` / `PageDown` |
| Toggle left sidebar | `Ctrl+\` |
| Toggle Properties panel | `Ctrl+Shift+\` |
| Open Markups list | `Ctrl+L` |
| Toggle reference view | `Ctrl+Shift+2` |
| Search drawing text | `Ctrl+Shift+F` |
| Open Quantities | `Ctrl+Alt+Q` |

## Project and file

| Action | Shortcut |
| --- | --- |
| New project | `Ctrl+N` |
| Open drawing | `Ctrl+O` |
| Open project | `Ctrl+Shift+O` |
| Save | `Ctrl+S` |
| Save as | `Ctrl+Shift+S` |
| Export menu | `Ctrl+E` |
| Project settings | `Ctrl+,` |
| Quit | `Ctrl+Q` |
| Undo | `Ctrl+Z` |
| Redo | `Ctrl+Shift+Z` or `Ctrl+Y` |

## Help

| Action | Shortcut |
| --- | --- |
| Workflows | `Help → Workflows` |
| User guide | `F1` |
| Keyboard shortcuts | `?` |
| About GridScalr | `Help → About GridScalr` |

## Menu access

The menu bar supports the mouse and keyboard:

- Click a menu name to open it.
- Use `Left` / `Right` to move between open menus.
- Use `Up` / `Down` to move between items.
- Press `Enter` or `Space` to activate an item.
- Press `Esc` to close the menu.
