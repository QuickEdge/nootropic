"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const chat_completions_1 = require("./routes/chat-completions");
const error_handler_1 = require("./middleware/error-handler");
dotenv_1.default.config();
const app = (0, express_1.default)();
const port = process.env.PORT || 3000;
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.get('/', (req, res) => {
    res.json({ message: 'Anthropic OpenAI Proxy Server' });
});
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});
app.use('/v1/chat/completions', chat_completions_1.chatCompletionsRouter);
app.use(error_handler_1.errorHandler);
app.listen(port, () => {
    console.log(`Anthropic OpenAI Proxy listening on port ${port}`);
});
//# sourceMappingURL=index.js.map