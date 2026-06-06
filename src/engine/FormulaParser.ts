import type { CellId, CellError } from './types';
import { expandRange, inBounds, parseCellId } from './RangeUtils';

// ---------------------------------------------------------------------------
// Token types
// ---------------------------------------------------------------------------

type TokenType =
  | 'NUMBER'
  | 'CELL_REF'
  | 'FUNC_NAME'
  | 'LPAREN'
  | 'RPAREN'
  | 'COLON'
  | 'PLUS'
  | 'MINUS'
  | 'STAR'
  | 'SLASH'
  | 'EOF';

interface Token {
  type: TokenType;
  value: string;
}

// ---------------------------------------------------------------------------
// AST node types
// ---------------------------------------------------------------------------

export type ASTNode =
  | { kind: 'Number'; value: number }
  | { kind: 'Text'; value: string }
  | { kind: 'CellRef'; id: CellId }
  | { kind: 'BinOp'; op: '+' | '-' | '*' | '/'; left: ASTNode; right: ASTNode }
  | { kind: 'RangeFunc'; name: 'SUM' | 'AVERAGE'; from: CellId; to: CellId }
  | { kind: 'Error'; error: CellError };

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    // Whitespace
    if (/\s/.test(input[i])) {
      i++;
      continue;
    }

    // Number literal (integer or decimal)
    if (/\d/.test(input[i]) || (input[i] === '.' && /\d/.test(input[i + 1] ?? ''))) {
      let j = i;
      while (j < input.length && /[\d.]/.test(input[j])) j++;
      tokens.push({ type: 'NUMBER', value: input.slice(i, j) });
      i = j;
      continue;
    }

    // Identifier → CELL_REF or FUNC_NAME
    if (/[A-Za-z]/.test(input[i])) {
      let j = i;
      while (j < input.length && /[A-Za-z0-9]/.test(input[j])) j++;
      const upper = input.slice(i, j).toUpperCase();
      if (/^[A-Z]+\d+$/.test(upper)) {
        tokens.push({ type: 'CELL_REF', value: upper });
      } else {
        // Pure alphabetic → function name
        tokens.push({ type: 'FUNC_NAME', value: upper });
      }
      i = j;
      continue;
    }

    // Single-char operators / punctuation
    const ch = input[i];
    switch (ch) {
      case '+': tokens.push({ type: 'PLUS',   value: '+' }); break;
      case '-': tokens.push({ type: 'MINUS',  value: '-' }); break;
      case '*': tokens.push({ type: 'STAR',   value: '*' }); break;
      case '/': tokens.push({ type: 'SLASH',  value: '/' }); break;
      case '(': tokens.push({ type: 'LPAREN', value: '(' }); break;
      case ')': tokens.push({ type: 'RPAREN', value: ')' }); break;
      case ':': tokens.push({ type: 'COLON',  value: ':' }); break;
      // Silently skip unrecognised characters (e.g. stray quotes, spaces)
    }
    i++;
  }

  tokens.push({ type: 'EOF', value: '' });
  return tokens;
}

// ---------------------------------------------------------------------------
// Recursive-descent parser
// ---------------------------------------------------------------------------

class Parser {
  private pos = 0;

  constructor(private readonly tokens: Token[]) {}

  peek(): Token {
    return this.tokens[this.pos];
  }

  private consume(): Token {
    return this.tokens[this.pos++];
  }

  private expect(type: TokenType): Token | null {
    if (this.peek().type !== type) return null;
    return this.consume();
  }

  /** Top-level: expr → term (('+' | '-') term)* */
  parseExpr(): ASTNode {
    let node = this.parseTerm();

    while (this.peek().type === 'PLUS' || this.peek().type === 'MINUS') {
      const op = this.consume().value as '+' | '-';
      const right = this.parseTerm();
      node = { kind: 'BinOp', op, left: node, right };
    }

    return node;
  }

  /** term → factor (('*' | '/') factor)* */
  private parseTerm(): ASTNode {
    let node = this.parseFactor();

    while (this.peek().type === 'STAR' || this.peek().type === 'SLASH') {
      const op = this.consume().value as '*' | '/';
      const right = this.parseFactor();
      node = { kind: 'BinOp', op, left: node, right };
    }

    return node;
  }

  /** factor → number | '(' expr ')' | unary '-' | cellRef | rangeFunc */
  private parseFactor(): ASTNode {
    const tok = this.peek();

    // Number literal
    if (tok.type === 'NUMBER') {
      this.consume();
      return { kind: 'Number', value: parseFloat(tok.value) };
    }

    // Parenthesised expression
    if (tok.type === 'LPAREN') {
      this.consume();
      const node = this.parseExpr();
      if (!this.expect('RPAREN')) {
        return { kind: 'Error', error: 'PARSE_ERROR' };
      }
      return node;
    }

    // Unary minus  →  0 - factor
    if (tok.type === 'MINUS') {
      this.consume();
      const factor = this.parseFactor();
      return { kind: 'BinOp', op: '-', left: { kind: 'Number', value: 0 }, right: factor };
    }

    // Cell reference  (e.g. A1, Z100)
    if (tok.type === 'CELL_REF') {
      this.consume();
      return { kind: 'CellRef', id: tok.value };
    }

    // Function call  SUM(...) / AVERAGE(...)
    if (tok.type === 'FUNC_NAME') {
      const name = tok.value;
      this.consume();

      if (name !== 'SUM' && name !== 'AVERAGE') {
        // Consume the call arguments so the rest of the formula can still parse
        if (this.peek().type === 'LPAREN') {
          this.consume();
          let depth = 1;
          while (depth > 0 && this.peek().type !== 'EOF') {
            if (this.peek().type === 'LPAREN') depth++;
            if (this.peek().type === 'RPAREN') depth--;
            this.consume();
          }
        }
        return { kind: 'Error', error: 'NAME_ERROR' };
      }

      // SUM(from:to) / AVERAGE(from:to)
      if (!this.expect('LPAREN')) return { kind: 'Error', error: 'PARSE_ERROR' };
      const fromTok = this.expect('CELL_REF');
      if (!fromTok)              return { kind: 'Error', error: 'PARSE_ERROR' };
      if (!this.expect('COLON')) return { kind: 'Error', error: 'PARSE_ERROR' };
      const toTok = this.expect('CELL_REF');
      if (!toTok)                return { kind: 'Error', error: 'PARSE_ERROR' };
      if (!this.expect('RPAREN')) return { kind: 'Error', error: 'PARSE_ERROR' };

      return {
        kind: 'RangeFunc',
        name: name as 'SUM' | 'AVERAGE',
        from: fromTok.value,
        to: toTok.value,
      };
    }

    return { kind: 'Error', error: 'PARSE_ERROR' };
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a raw formula string (must start with '=') into an AST.
 * Returns an Error node instead of throwing on any syntax problem.
 */
export function parseFormula(raw: string): ASTNode {
  if (!raw.startsWith('=')) {
    return { kind: 'Error', error: 'PARSE_ERROR' };
  }

  const expr = raw.slice(1).trim();
  if (expr === '') {
    return { kind: 'Error', error: 'PARSE_ERROR' };
  }

  const tokens = tokenize(expr);
  const parser = new Parser(tokens);

  try {
    const node = parser.parseExpr();
    // If there are unconsumed non-EOF tokens the formula is malformed
    if (parser.peek().type !== 'EOF') {
      return { kind: 'Error', error: 'PARSE_ERROR' };
    }
    return node;
  } catch {
    return { kind: 'Error', error: 'PARSE_ERROR' };
  }
}

/** Walk an AST depth-first, calling visitor on every node. */
function walkAST(node: ASTNode, visitor: (n: ASTNode) => void): void {
  visitor(node);
  if (node.kind === 'BinOp') {
    walkAST(node.left, visitor);
    walkAST(node.right, visitor);
  }
  // RangeFunc, Error, Number, Text, CellRef have no child ASTNodes to walk
}

/**
 * Collect all cell IDs that the formula AST depends on.
 * Out-of-bounds refs are excluded so they never pollute the dep graph.
 */
export function extractDeps(ast: ASTNode): Set<CellId> {
  const deps = new Set<CellId>();
  walkAST(ast, (n) => {
    if (n.kind === 'CellRef') {
      const { col, row } = parseCellId(n.id);
      if (inBounds(col, row)) deps.add(n.id);
    }
    if (n.kind === 'RangeFunc') {
      expandRange(n.from, n.to).forEach((id) => {
        const { col, row } = parseCellId(id);
        if (inBounds(col, row)) deps.add(id);
      });
    }
  });
  return deps;
}
