import "./styles.css";
import { App } from "./app/App";

const root = document.getElementById("app");

if (!root) {
  throw new Error("The application root element is missing.");
}

const app = new App(root);

if (import.meta.hot) {
  import.meta.hot.dispose(() => app.dispose());
}
