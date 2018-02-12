import * as SVG from 'svg.js';
import Word from './components/word.js';
import WordCluster from './components/wordcluster.js';
import Link from './components/link.js';

class TAG {

  // constructor
  // @container { Node | String | null }
  //      a container element, an id to an element, or null
  constructor(container) {
    if (container) {
      if (typeof container === 'string') {
        container = document.getElementById(container);
      }
    } else {
      container = document.createElement('div');
      document.body.appendChild(container);
    }
    this.domContainer = container;
    this.svg = new SVG.Doc(container);

    this.resize();
  }

  resize() {
    let rect = this.domContainer.getBoundingClientRect();

    this.svg
      .size(rect.width, rect.height);
  }

  export() {
    return this.svg.svg();
  }
}

TAG.Word = Word;
TAG.Link = Link;
TAG.WordCluster = WordCluster;

module.exports = TAG;