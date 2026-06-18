import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
  vscode.window.showInformationMessage('Start all tests.');

  test('Sample test', () => {
    assert.strictEqual(-1, [1, 2, 3].indexOf(5));
    assert.strictEqual(-1, [1, 2, 3].indexOf(0));
  });

  test('Extension should be present', () => {
    assert.ok(vscode.extensions.getExtension('vxrdhxn.orbit'));
  });

  test('should activate extension', async () => {
    const ext = vscode.extensions.getExtension('vxrdhxn.orbit');
    if (ext) {
      await ext.activate();
      assert.strictEqual(ext.isActive, true);
    } else {
      assert.fail('Extension not found');
    }
  });
});
