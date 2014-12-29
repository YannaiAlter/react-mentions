var React = require('react');
var LinkedValueUtils = require('react/lib/LinkedValueUtils');
var emptyFunction = require('react/lib/emptyFunction');


var utils = require('./utils');
var Mention = require('./Mention');
var SuggestionsOverlay = require('./SuggestionsOverlay');


var _generateComponentKey = function(usedKeys, id) {
  if(!usedKeys.hasOwnProperty(id)) {
    usedKeys[id] = 0;
  } else {
    usedKeys[id]++;
  }
  return id + "_" + usedKeys[id];
};

var _getTriggerRegex = function(trigger) {
  if(trigger instanceof RegExp) {
    return trigger;
  } else {
    var escapedTriggerChar = utils.escapeRegex(trigger);

    // first capture group is the part to be replaced on completion
    // second capture group is for extracting the search query
    return new RegExp("(?:^|\\s)(" + escapedTriggerChar + "([^\\s" + escapedTriggerChar + "]*))$");
  }
};

var _getDataProvider = function(data) {
  if(data instanceof Array) {
    // if data is an array, create a function to query that
    return function(query, callback) {
      var results = [];
      for(var i=0, l=data.length; i < l; ++i) {
        var display = data[i].display || data[i].id;
        if(display.toLowerCase().indexOf(query.toLowerCase()) >= 0) {
          results.push(data[i]);
        }
      }
      return results;
    };
  } else {
    // expect data to be a query function
    return data;
  }
};

var KEY = { TAB : 9, RETURN : 13, ESC : 27, UP : 38, DOWN : 40 };


module.exports = React.createClass({

  displayName: 'MentionsInput',

  mixins: [
    LinkedValueUtils.Mixin
  ],

  propTypes: {

    /**
     * If set to `true` a regular text input element will be rendered
     * instead of a textarea
     */
    singleLine: React.PropTypes.bool,

    markup: React.PropTypes.string,

    displayTransform: React.PropTypes.func,

    children: React.PropTypes.arrayOf(React.PropTypes.element)

  },

  childContextTypes: {
    markup: React.PropTypes.string.isRequired
  },

  getDefaultProps: function () {
    return {
      markup: "@[__display__](__id__)",
      singleLine: false,
      displayTransform: null,

      onKeyDown: emptyFunction,
      onSelect: emptyFunction,
      onBlur: emptyFunction
    };
  },

  getInitialState: function () {
    return {
      selectionStart: null,
      selectionEnd: null,

      suggestions: {}
    };
  },

  getChildContext: function() {
    return {
      markup: this.props.markup
    };
  },

  render: function() {
    return (
      <div className="react-mentions">
        <div className={"control " + (this.props.singleLine ? "input" : "textarea")}>
          <div className="highlighter">
            { this.renderHighlighter() }
          </div>
          { this.renderInput() }
        </div>
        { this.renderSuggestionsOverlay() }
      </div>
    );
  },

  renderInput: function() {
    if(this.props.singleLine) {
      return (
        <input ref="input"
          type="text"
          value={this.getPlainText()} 
          onChange={this.handleChange}
          onSelect={this.handleSelect}
          onKeyDown={this.handleKeyDown}
          onFocus={this.props.onFocus}
          onBlur={this.handleBlur} />
      );
    } else {
      return (
        <textarea ref="input"
          value={this.getPlainText()} 
          onChange={this.handleChange}
          onSelect={this.handleSelect}
          onKeyDown={this.handleKeyDown}
          onFocus={this.props.onFocus}
          onBlur={this.handleBlur} />
      );
    }
  },

  renderSuggestionsOverlay: function() {
    return (
      <SuggestionsOverlay
        ref="suggestions"
        suggestions={this.state.suggestions}
        onSelect={this.addMention} />
    );
  },

  renderHighlighter: function() {
    var value = LinkedValueUtils.getValue(this) || "";

    var resultComponents = [];
    var components = resultComponents;
    var componentKeys = {};

    // If there's a caret (i.e. no range selection), get the position of the
    var caretPositionInMarkup;
    if(this.state.selectionStart === this.state.selectionEnd) {
      caretPositionInMarkup = utils.mapPlainTextIndex(value, this.props.markup, this.state.selectionStart);
    }

    var textIteratee = function(substr, index, indexInPlainText) {
      // check whether the caret element has to be inserted inside the current plain substring
      if(caretPositionInMarkup >= index && caretPositionInMarkup <= index + substr.length) {
        // if yes, split substr at the caret position and insert the caret component
        var splitIndex = caretPositionInMarkup - index;
        components.push(substr.substring(0, splitIndex));
        var caretComponent = this.renderHighlighterCaret();
        resultComponents.push(caretComponent);

        // add all following substrings and mention components as children of the caret component
        components = caretComponent.props.children = [ substr.substring(splitIndex) ];
      } else {
        // otherwise just push the plain text substring
        components.push(substr);
      }
    }.bind(this);

    var mentionIteratee = function(markup, index, indexInPlainText, id, display, type, lastMentionEndIndex) {
      // generate a component key based on the id
      var key = _generateComponentKey(componentKeys, id);
      components.push(
        this.getMentionComponentForMatch(id, display, type, key)
      );
    }.bind(this);
    utils.iterateMentionsMarkup(value, this.props.markup, textIteratee, mentionIteratee, this.props.displayTransform);

    return resultComponents;
  },

  // Renders an component to be inserted in the highlighter at the current caret position
  renderHighlighterCaret: function() {
    return (
      <span className="caret" ref="caret" key="caret">
        { this.renderSuggestionsOverlay() }
      </span>
    );
  },

  // Returns a clone of the Mention child applicable for the specified type to be rendered inside the highlighter
  getMentionComponentForMatch: function(id, display, type, key) {
    var childrenCount = React.Children.count(this.props.children);
    var props = { id: id, display: display, key: key };

    if(childrenCount > 1) {
      if(!type) {
        throw new Error(
          "Since multiple Mention components have been passed as children, the markup has to define the __type__ placeholder"
        );
      }

      // detect the Mention child to be cloned
      var foundChild = null;
      React.Children.forEach(this.props.children, function(child) {
        if(child.props.type === type) {
          foundChild = child;
        }
      });

      // clone the Mention child that is applicable for the given type
      return React.addons.cloneWithProps(foundChild, props);
    } else if(childrenCount === 1) {
      // clone single Mention child
      var child = this.props.children.length ? this.props.children[0] : React.Children.only(this.props.children);
      return React.addons.cloneWithProps(child, props );
    } else {
      // no children, use default configuration
      return Mention(props);
    }
  },

  // Returns the text to set as the value of the textarea with all markups removed
  getPlainText: function() {
    var value = LinkedValueUtils.getValue(this) || "";
    return utils.getPlainText(value, this.props.markup, this.props.displayTransform);
  },

  // Handle input element's change event
  handleChange: function(ev) {
    var value = LinkedValueUtils.getValue(this) || "";
    var newPlainTextValue = ev.target.value;

    // Derive the new value to set by applying the local change in the textarea's plain text
    var newValue = utils.applyChangeToValue(
      value, this.props.markup,
      newPlainTextValue,
      this.state.selectionStart, this.state.selectionEnd, 
      ev.target.selectionEnd,
      this.props.displayTransform
    );

    // Save current selection after change to be able to restore caret position after rerendering
    var selectionStart = ev.target.selectionStart;
    var selectionEnd = ev.target.selectionEnd;

    //if(selectionStart !== selectionEnd) {
    //  // used browser's undo/redo
    //}

    // Adjust selection range in case a mention will be deleted by the characters outside of the 
    // selection range that are automatically deleted
    var startOfMention = utils.findStartOfMentionInPlainText(value, this.props.markup, selectionStart, this.props.displayTransform);
    if(this.state.selectionEnd > startOfMention) {
      // only if a deletion has taken place
      selectionStart = startOfMention;
      selectionEnd = selectionStart;
    }

    this.setState({
      selectionStart: selectionStart,
      selectionEnd: selectionEnd
    });

    // Show, hide, or update suggestions overlay
    //this.updateMentionsQueries(newPlainTextValue, selectionStart);

    // Propagate change
    var handleChange = LinkedValueUtils.getOnChange(this) || emptyFunction;
    handleChange.call(this, ev, newValue);
  },

  // Handle input element's select event
  handleSelect: function(ev) {
    // keep track of selection range / caret position
    this.setState({
      selectionStart: ev.target.selectionStart,
      selectionEnd: ev.target.selectionEnd
    });

    // refresh suggestions queries
    var el = this.refs.input.getDOMNode();
    if(ev.target.selectionStart === ev.target.selectionEnd) {
      this.updateMentionsQueries(el.value, ev.target.selectionStart);
    } else {
      this.clearSuggestions();
    }

    this.props.onSelect(ev);
  },

  handleKeyDown: function(ev) {
    // do not intercept key events if the suggestions overlay is not shown
    var suggestionsCount = 0;
    for(var prop in this.state.suggestions) {
      if(this.state.suggestions.hasOwnProperty(prop)) {
        suggestionsCount += this.state.suggestions[prop].results.length;
      }
    }
    if(suggestionsCount === 0) return;

    var suggestionsComp = this.refs.suggestions;

    var keyHandlers = {};
    keyHandlers[KEY.ESC] = this.clearSuggestions;
    keyHandlers[KEY.DOWN] = suggestionsComp.shiftFocus.bind(null, +1);
    keyHandlers[KEY.UP] = suggestionsComp.shiftFocus.bind(null, -1);
    keyHandlers[KEY.RETURN] = suggestionsComp.selectFocused;
    keyHandlers[KEY.TAB] = suggestionsComp.selectFocused;

    if(keyHandlers[ev.keyCode]) {
      keyHandlers[ev.keyCode]();
      ev.preventDefault();
    } else {
      this.props.onKeyDown(ev);
    }
    
  },

  handleBlur: function(ev) {
    // reset selection
    this.setState({
      selectionStart: null,
      selectionEnd: null
    });

    this.props.onBlur(ev);
  },

  autogrowTextarea: function() {
    var el = this.refs.input.getDOMNode();
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  },

  updateSuggestionsPosition: function() {
    if(!this.refs.caret || !this.refs.suggestions) return;

    var caretEl = this.refs.caret.getDOMNode();
    var suggestionsEl = this.refs.suggestions.getDOMNode();
    if(!suggestionsEl) return;

    suggestionsEl.style.left = caretEl.offsetLeft + "px";
    suggestionsEl.style.top = caretEl.offsetTop + "px";
  },

  componentDidMount: function() {
    this.autogrowTextarea();
    this.updateSuggestionsPosition();
  },

  componentDidUpdate: function() {
    this.autogrowTextarea();
    this.updateSuggestionsPosition();

    // maintain selection in case a mention is added/removed causing
    // the cursor to jump to the end
    this.setSelection(this.state.selectionStart, this.state.selectionEnd);
  },

  setSelection: function(selectionStart, selectionEnd) {
    if(selectionStart === null || selectionEnd === null) return;
    
    var el = this.refs.input.getDOMNode();
    if(el.setSelectionRange) {
      el.setSelectionRange(selectionStart, selectionEnd);
    }
    else if(el.createTextRange) {
      var range = el.createTextRange();
      range.collapse(true);
      range.moveEnd('character', selectionEnd);
      range.moveStart('character', selectionStart);
      range.select();
    }
  },

  updateMentionsQueries: function(plainTextValue, caretPosition) {
    // Invalidate previous queries. Async results for previous queries will be neglected.
    this._queryId++;
    this.setState({
      suggestions: {}
    });

    // If caret is inside of or directly behind of mention, do not query
    var value = LinkedValueUtils.getValue(this) || "";
    if( utils.isInsideOfMention(value, this.props.markup, caretPosition) || 
        utils.isInsideOfMention(value, this.props.markup, caretPosition-1) ) {
      return;
    }
    
    // Check if suggestions have to be shown:
    // Match the trigger patterns of all Mention children the new plain text substring up to the current caret position
    var substring = plainTextValue.substring(0, caretPosition);

    var that = this;
    React.Children.forEach(this.props.children, function(child) {
      var regex = _getTriggerRegex(child.props.trigger);
      var match = substring.match(regex);
      if(match) {
        var querySequenceStart = substring.indexOf(match[1], match.index);
        that.queryData(match[2], child, querySequenceStart, querySequenceStart+match[1].length);
      }
    });
  },

  clearSuggestions: function() {
    // Invalidate previous queries. Async results for previous queries will be neglected.
    this._queryId++;
    this.setState({
      suggestions: {}
    });
  },

  queryData: function(query, mentionDescriptor, querySequenceStart, querySequenceEnd) {
    var provideData = _getDataProvider(mentionDescriptor.props.data);
    var snycResult = provideData(query, this.updateSuggestions.bind(null, this._queryId, mentionDescriptor, query, querySequenceStart, querySequenceEnd));
    if(snycResult instanceof Array) {
      this.updateSuggestions(this._queryId, mentionDescriptor, query, querySequenceStart, querySequenceEnd, snycResult);
    }
  },

  updateSuggestions: function(queryId, mentionDescriptor, query, querySequenceStart, querySequenceEnd, suggestions) {
    // neglect async results from previous queries
    if(queryId !== this._queryId) return;

    var update = {};
    update[mentionDescriptor.type] = {
      query: query,
      mentionDescriptor: mentionDescriptor,
      querySequenceStart: querySequenceStart, 
      querySequenceEnd: querySequenceEnd,
      results: suggestions
    };

    this.setState({
      suggestions: utils.extend({}, this.state.suggestions, update)
    });
  },

  addMention: function(suggestion, mentionDescriptor, querySequenceStart, querySequenceEnd) {
    // Insert mention in the marked up value at the correct position 
    var value = LinkedValueUtils.getValue(this) || "";
    var start = utils.mapPlainTextIndex(value, this.props.markup, querySequenceStart);
    var end = start + querySequenceEnd - querySequenceStart;
    var insert = utils.makeMentionsMarkup(this.props.markup, suggestion.id, suggestion.display, mentionDescriptor.props.type);
    var newValue = utils.spliceString(value, start, end, insert);

    // Refocus input and set caret position to end of mention
    this.refs.input.getDOMNode().focus();
    var newCaretPosition = querySequenceStart + suggestion.display.length;
    this.setState({
      selectionStart: newCaretPosition,
      selectionEnd: newCaretPosition
    });

    // Propagate change
    var handleChange = LinkedValueUtils.getOnChange(this) || emptyFunction;
    handleChange.call(this, null, newValue);

    // Make sure the suggestions overlay is closed
    this.clearSuggestions();
  },

  _queryId: 0

    
});