import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function parse(path, kind = ts.ScriptKind.TS) {
  return ts.createSourceFile(path, readFileSync(new URL(path, import.meta.url), 'utf8'),
    ts.ScriptTarget.Latest, true, kind);
}
function find(root, predicate) {
  if (predicate(root)) return root;
  let found;
  ts.forEachChild(root, child => { if (!found) found = find(child, predicate); });
  return found;
}
function actionBody(source, name) {
  const branch = find(source, node => ts.isIfStatement(node)
    && ts.isBinaryExpression(node.expression)
    && node.expression.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken
    && ts.isIdentifier(node.expression.left) && node.expression.left.text === 'action'
    && ts.isStringLiteral(node.expression.right) && node.expression.right.text === name);
  assert.ok(branch && ts.isBlock(branch.thenStatement), `Missing action: ${name}`);
  return branch.thenStatement;
}
function weeklyPlanFrom(node) {
  return ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
    && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === 'supabase'
    && node.expression.name.text === 'from'
    && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0])
    && node.arguments[0].text === 'weekly_plan';
}

const route = parse('../../app/api/chat/route.ts');
const frontend = parse('../../app/FormaPro.tsx', ts.ScriptKind.TSX);

test('actualizar_usuario cannot access weekly_plan', () => {
  assert.equal(find(actionBody(route, 'actualizar_usuario'), weeklyPlanFrom), undefined);
});

test('frontend PLAN consumer still delegates to guardar_plan_semana', () => {
  const parser = find(frontend, node => ts.isVariableDeclaration(node)
    && ts.isIdentifier(node.name) && node.name.text === 'procesarTags');
  assert.ok(parser?.initializer && ts.isArrowFunction(parser.initializer));
  const consumer = find(parser.initializer.body, node => ts.isCallExpression(node)
    && ts.isIdentifier(node.expression) && node.expression.text === 'procesarTag'
    && node.arguments[0] && ts.isStringLiteral(node.arguments[0])
    && node.arguments[0].text === '[PLAN:');
  const callback = consumer?.arguments[2];
  assert.ok(callback && ts.isArrowFunction(callback));
  assert.ok(find(callback.body, node => ts.isCallExpression(node)
    && ts.isIdentifier(node.expression) && node.expression.text === 'apiCall'
    && node.arguments.some(arg => ts.isObjectLiteralExpression(arg)
      && arg.properties.some(property => ts.isPropertyAssignment(property)
        && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
        && property.name.text === 'action' && ts.isStringLiteral(property.initializer)
        && property.initializer.text === 'guardar_plan_semana'))));
});

test('canonical week save uses strict PlanMutation without weekly_plan upsert', () => {
  const body = actionBody(route, 'guardar_plan_semana');
  assert.ok(find(body, node => ts.isCallExpression(node)
    && ts.isIdentifier(node.expression) && node.expression.text === 'validatePlanMutation'));
  assert.equal(find(body, node => ts.isCallExpression(node)
    && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'upsert'
    && weeklyPlanFrom(node.expression.expression)), undefined);
});
