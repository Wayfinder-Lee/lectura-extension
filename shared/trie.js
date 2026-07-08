/**
 * Trie (prefix tree) for efficient multi-word matching in text.
 *
 * Instead of running N separate regex searches over each text node,
 * we walk the text character-by-character through the Trie once.
 * This gives O(text_length) matching regardless of vocabulary size.
 */

class TrieNode {
  constructor() {
    /** @type {Map<string, TrieNode>} */
    this.children = new Map();
    /** @type {null|{ itemId: string, color: string|null, mastered: boolean, text: string }} */
    this.wordData = null;
  }
}

export class WordTrie {
  constructor() {
    this.root = new TrieNode();
    this._size = 0;
  }

  /**
   * Number of words in the trie.
   * @returns {number}
   */
  get size() {
    return this._size;
  }

  /**
   * Insert a word into the trie.
   * @param {string} word - The word text (lowercased)
   * @param {string} itemId - Storage ID of the saved item
   * @param {string|null} color - Macaron color hex or null
   * @param {boolean} mastered - Whether the word is mastered
   */
  insert(word, itemId, color, mastered) {
    if (!word || word.length < 2) return;

    let node = this.root;
    for (const char of word) {
      if (!node.children.has(char)) {
        node.children.set(char, new TrieNode());
      }
      node = node.children.get(char);
    }

    // Only count as new if this exact word wasn't already stored
    if (!node.wordData) {
      this._size++;
    }

    node.wordData = { itemId, color, mastered, text: word };
  }

  /**
   * Find all word matches in a text string.
   * Matches are greedy: the longest possible match at each position wins.
   *
   * @param {string} text - The text to search
   * @returns {Array<{ start: number, end: number, itemId: string, color: string|null, mastered: boolean, text: string }>}
   */
  findMatches(text) {
    const matches = [];
    const len = text.length;
    let i = 0;

    while (i < len) {
      // Only start matching at word boundaries (after space, punctuation, or at start)
      if (i > 0 && this._isWordChar(text[i - 1])) {
        i++;
        continue;
      }

      let node = this.root;
      let longestMatch = null;
      let j = i;

      while (j < len && node.children.has(text[j].toLowerCase())) {
        node = node.children.get(text[j].toLowerCase());
        j++;

        if (node.wordData) {
          // Check word boundary at end
          if (j >= len || !this._isWordChar(text[j])) {
            longestMatch = {
              start: i,
              end: j,
              itemId: node.wordData.itemId,
              color: node.wordData.color,
              mastered: node.wordData.mastered,
              text: node.wordData.text
            };
          }
        }
      }

      if (longestMatch) {
        matches.push(longestMatch);
        i = longestMatch.end; // skip past the matched word
      } else {
        i++;
      }
    }

    return matches;
  }

  /**
   * Remove a word from the trie.
   * @param {string} word
   */
  remove(word) {
    if (!word) return;
    this._removeHelper(this.root, word, 0);
  }

  _removeHelper(node, word, depth) {
    if (depth === word.length) {
      if (node.wordData) {
        node.wordData = null;
        this._size--;
      }
      return node.children.size === 0;
    }

    const char = word[depth];
    if (!node.children.has(char)) return false;

    const shouldDelete = this._removeHelper(node.children.get(char), word, depth + 1);

    if (shouldDelete) {
      node.children.delete(char);
      return node.children.size === 0 && !node.wordData;
    }
    return false;
  }

  /**
   * Build a trie from a collection of word items.
   * @param {Array<{ id: string, text: string, color: string|null, mastered: boolean }>} items
   * @returns {WordTrie}
   */
  static fromItems(items) {
    const trie = new WordTrie();
    for (const item of items) {
      if (item.type === 'word') {
        trie.insert(item.text.toLowerCase(), item.id, item.color, item.mastered);
      }
    }
    return trie;
  }

  /**
   * Check if a character is part of a word (alphanumeric, apostrophe, hyphen).
   * @param {string} char
   * @returns {boolean}
   * @private
   */
  _isWordChar(char) {
    return /[a-zA-Z0-9'\-]/.test(char);
  }
}
