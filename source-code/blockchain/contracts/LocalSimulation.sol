// contracts/LocalSimulation.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract LocalSimulation {
    struct Result {
        string sessionId;
        address candidate;
        uint256 overallScore;
        uint256 technicalScore;
        uint256 punctualityScore;
        uint256 adaptabilityScore;
        uint256 githubScore;
        uint256 timestamp;
        bool verified;
    }
    
    mapping(string => Result) public results;
    mapping(address => string[]) public userResults;
    
    // Events
    event ResultStored(string sessionId, address indexed candidate, uint256 score);
    event ResultVerified(string indexed sessionId, address indexed verifier);
    
    // ''ANYONE can store results - no restrictions!
    function storeResult(
        string memory sessionId,
        address candidate,
        uint256 overallScore,
        uint256 technicalScore,
        uint256 punctualityScore,
        uint256 adaptabilityScore,
        uint256 githubScore
    ) public {
        require(overallScore <= 100, "Score must be <= 100");
        require(candidate != address(0), "Invalid candidate address");
        require(bytes(sessionId).length > 0, "Session ID cannot be empty");
        
        // Prevent overwriting existing results (optional)
        // require(results[sessionId].candidate == address(0), "Result already exists");
        
        results[sessionId] = Result({
            sessionId: sessionId,
            candidate: candidate,
            overallScore: overallScore,
            technicalScore: technicalScore,
            punctualityScore: punctualityScore,
            adaptabilityScore: adaptabilityScore,
            githubScore: githubScore,
            timestamp: block.timestamp,
            verified: false
        });
        
        userResults[candidate].push(sessionId);
        
        emit ResultStored(sessionId, candidate, overallScore);
    }
    
    // Get result - anyone can view
    function getResult(string memory sessionId) public view returns (Result memory) {
        require(results[sessionId].candidate != address(0), "Session result does not exist");
        return results[sessionId];
    }
    
    // ''ANYONE can verify results
    function verifyResult(string memory sessionId) public {
        require(results[sessionId].candidate != address(0), "Session result does not exist");
        require(!results[sessionId].verified, "Result already verified");
        
        results[sessionId].verified = true;
        emit ResultVerified(sessionId, msg.sender);
    }
    
    // Get all session IDs for a candidate
    function getUserResults(address candidate) public view returns (string[] memory) {
        return userResults[candidate];
    }
    
    // Check if result exists
    function resultExists(string memory sessionId) public view returns (bool) {
        return results[sessionId].candidate != address(0);
    }
    
    // Get score only
    function getScore(string memory sessionId) public view returns (uint256) {
        require(results[sessionId].candidate != address(0), "Session result does not exist");
        return results[sessionId].overallScore;
    }
}